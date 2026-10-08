import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { sendEmailNotification } from "@/lib/email";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const quotationToInvoiceItemType = {
  LABOUR: "LABOUR",
  PART: "PART",
  DIAGNOSTIC: "DIAGNOSTIC",
  EXTERNAL: "EXTERNAL",
  MISCELLANEOUS: "MISCELLANEOUS",
} as const;

const updateSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("QUALITY_CHECK"),
    passed: z.boolean(),
    notes: z.string().trim().max(5000).optional(),
  }).refine((value) => value.passed || !!value.notes?.trim(), "Explain any quality-check failure."),
  z.object({ action: z.literal("DELIVER") }),
  z.object({ action: z.literal("CANCEL"), reason: z.string().trim().min(3).max(2000) }),
  z.object({ action: z.literal("SAVE_NOTES"), notes: z.string().trim().max(5000) }),
]);

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const user = await requirePermission("jobCards:manage");
  if (user instanceof Response) return user;
  const { id: rawId } = await context.params;
  if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) {
    return Response.json({ error: "Invalid job card ID." }, { status: 400 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Invalid job-card update.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const job = await transaction.jobCard.findUnique({
        where: { id: Number(rawId) },
        include: {
          appointment: {
            include: {
              customer: { select: { id: true, name: true, email: true } },
              vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } },
              service: { select: { name: true } },
            },
          },
          quotation: { include: { items: { orderBy: { id: "asc" } } } },
          invoice: { select: { id: true, status: true, totalAmount: true } },
        },
      });
      if (!job) throw new Error("JOB_CARD_NOT_FOUND");

      const updatedId = job.id;
      let action: string;
      let details: Prisma.InputJsonValue;

      if (parsed.data.action === "QUALITY_CHECK") {
        if (job.status !== "QUALITY_CHECK") throw new Error("JOB_NOT_AWAITING_QUALITY_CHECK");
        if (job.quotation?.status !== "APPROVED") throw new Error("QUOTATION_APPROVAL_REQUIRED");
        const checkedAt = new Date();
        if (parsed.data.passed) {
          if (!job.workDone?.trim()) throw new Error("WORK_DESCRIPTION_REQUIRED");
          if (job.invoice) throw new Error("JOB_INVOICE_EXISTS");
          await transaction.invoice.create({
            data: {
              customerId: job.appointment.customer.id,
              vehicleId: job.appointment.vehicle.id,
              jobCardId: job.id,
              totalAmount: job.quotation.totalAmount,
              items: {
                create: job.quotation.items.map((item) => ({
                  itemType: quotationToInvoiceItemType[item.itemType],
                  itemName: item.description,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  discountAmount: item.discountAmount,
                  lineTotal: item.lineTotal,
                })),
              },
            },
          });
          const changed = await transaction.jobCard.updateMany({
            where: { id: job.id, status: "QUALITY_CHECK" },
            data: {
              status: "COMPLETED",
              completedAt: checkedAt,
              qualityCheckedAt: checkedAt,
              qualityCheckedByUserId: user.id,
              qualityNotes: parsed.data.notes?.trim() || null,
            },
          });
          if (!changed.count) throw new Error("JOB_NOT_AWAITING_QUALITY_CHECK");
          action = "JOB_CARD_QUALITY_CHECK_PASSED";
          details = { passed: true, notes: parsed.data.notes?.trim() || null };
        } else {
          const changed = await transaction.jobCard.updateMany({
            where: { id: job.id, status: "QUALITY_CHECK" },
            data: {
              status: "IN_PROGRESS",
              qualityCheckedAt: checkedAt,
              qualityCheckedByUserId: user.id,
              qualityNotes: parsed.data.notes?.trim() || null,
            },
          });
          if (!changed.count) throw new Error("JOB_NOT_AWAITING_QUALITY_CHECK");
          action = "JOB_CARD_QUALITY_CHECK_FAILED";
          details = { passed: false, notes: parsed.data.notes?.trim() ?? "" };
        }
      } else if (parsed.data.action === "DELIVER") {
        if (job.status !== "COMPLETED") throw new Error("JOB_NOT_READY_FOR_DELIVERY");
        if (!job.invoice || job.invoice.status !== "PAID") throw new Error("INVOICE_NOT_PAID");
        const deliveredAt = new Date();
        const changed = await transaction.jobCard.updateMany({
          where: { id: job.id, status: "COMPLETED" },
          data: { status: "DELIVERED", deliveredAt },
        });
        if (!changed.count) throw new Error("JOB_NOT_READY_FOR_DELIVERY");
        await transaction.appointment.update({
          where: { id: job.appointmentId },
          data: { status: "COMPLETED" },
        });
        action = "JOB_CARD_DELIVERED";
        details = { invoiceId: job.invoice.id, deliveredAt: deliveredAt.toISOString() };
      } else if (parsed.data.action === "CANCEL") {
        if (!["WAITING", "INSPECTION", "DIAGNOSIS", "AWAITING_APPROVAL"].includes(job.status)) {
          throw new Error("JOB_CANNOT_CANCEL_AFTER_REPAIR_START");
        }
        const changed = await transaction.jobCard.updateMany({
          where: { id: job.id, status: job.status },
          data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: parsed.data.reason },
        });
        if (!changed.count) throw new Error("JOB_CANNOT_CANCEL_AFTER_REPAIR_START");
        await transaction.appointment.update({
          where: { id: job.appointmentId },
          data: { status: "CANCELLED" },
        });
        await transaction.quotation.updateMany({
          where: { appointmentId: job.appointmentId, status: "SENT" },
          data: { status: "EXPIRED", approvalTokenHash: null },
        });
        action = "JOB_CARD_CANCELLED";
        details = { reason: parsed.data.reason };
      } else {
        if (job.status === "DELIVERED" || job.status === "CANCELLED") throw new Error("JOB_NOT_EDITABLE");
        await transaction.jobCard.update({
          where: { id: job.id },
          data: { notes: parsed.data.notes.trim() || null },
        });
        action = "JOB_CARD_NOTES_UPDATED";
        details = { notes: parsed.data.notes.trim() || null };
      }

      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action,
          entityType: "JobCard",
          entityId: updatedId,
          request,
          details,
        }),
      });
      const updated = await transaction.jobCard.findUnique({
        where: { id: updatedId },
        include: {
          qualityCheckedBy: { select: { name: true } },
          invoice: { select: { id: true, status: true, totalAmount: true } },
        },
      });
      if (!updated) throw new Error("JOB_CARD_NOT_FOUND");
      return { job: updated, action, customer: job.appointment.customer, vehicle: job.appointment.vehicle };
    });

    const emailNotification = result.action === "JOB_CARD_QUALITY_CHECK_PASSED"
      ? await sendEmailNotification({
          to: result.customer.email,
          subject: `Quality check complete — invoice INV-${result.job.invoice?.id ?? ""}`,
          text: `Hello ${result.customer.name}, job card JC-${result.job.id} for ${result.vehicle.registrationNumber} passed quality check. Invoice INV-${result.job.invoice?.id ?? ""} totals KSh ${Number(result.job.invoice?.totalAmount ?? 0).toLocaleString()}. Please settle the invoice before collecting your vehicle.`,
        })
      : result.action === "JOB_CARD_DELIVERED"
        ? await sendEmailNotification({
            to: result.customer.email,
            subject: `Vehicle delivered — JC-${result.job.id}`,
            text: `Hello ${result.customer.name}, your vehicle ${result.vehicle.registrationNumber} has been recorded as delivered. Thank you for choosing BizFlow Auto.`,
          })
        : undefined;
    return Response.json({ job: result.job, ...(emailNotification ? { emailNotification } : {}) });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "JOB_CARD_NOT_FOUND") return Response.json({ error: "Job card was not found." }, { status: 404 });
      if (error.message === "JOB_NOT_AWAITING_QUALITY_CHECK") return Response.json({ error: "This job is not awaiting a quality check." }, { status: 409 });
      if (error.message === "QUOTATION_APPROVAL_REQUIRED") return Response.json({ error: "An approved customer quotation is required before quality check." }, { status: 409 });
      if (error.message === "WORK_DESCRIPTION_REQUIRED") return Response.json({ error: "Record the work performed before passing quality check." }, { status: 409 });
      if (error.message === "JOB_INVOICE_EXISTS") return Response.json({ error: "An invoice already exists for this job card." }, { status: 409 });
      if (error.message === "JOB_NOT_READY_FOR_DELIVERY") return Response.json({ error: "Only a quality-approved job can be delivered." }, { status: 409 });
      if (error.message === "INVOICE_NOT_PAID") return Response.json({ error: "The invoice must be fully paid before vehicle delivery." }, { status: 409 });
      if (error.message === "JOB_CANNOT_CANCEL_AFTER_REPAIR_START") return Response.json({ error: "A job cannot be cancelled after repair work has started." }, { status: 409 });
      if (error.message === "JOB_NOT_EDITABLE") return Response.json({ error: "Notes cannot be changed after delivery or cancellation." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "An invoice already exists for this job card." }, { status: 409 });
    }
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Job-card workflow update failed.", error);
    return Response.json({ error: "Job card could not be updated." }, { status: 500 });
  }
}
