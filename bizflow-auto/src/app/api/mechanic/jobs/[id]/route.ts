import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { getSessionUser, isDatabaseUnavailable } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const updateJobSchema = z
  .object({
    diagnosis: z.string().trim().max(5000).nullable().optional(),
    workDone: z.string().trim().max(5000).nullable().optional(),
    status: z.enum(["IN_PROGRESS", "QUALITY_CHECK"]).optional(),
    partsUsed: z
      .array(z.object({ partId: z.number().int().positive(), quantity: z.number().int().positive().max(1000) }))
      .max(50)
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "At least one change is required.")
  .refine(
    (data) => !data.partsUsed || new Set(data.partsUsed.map((part) => part.partId)).size === data.partsUsed.length,
    "Each spare part may only appear once.",
  );

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "MECHANIC") {
    return Response.json({ error: "Mechanic access required." }, { status: 403 });
  }

  const { id: idParam } = await context.params;
  if (!/^[1-9]\d*$/.test(idParam) || !Number.isSafeInteger(Number(idParam))) {
    return Response.json({ error: "Invalid job card ID." }, { status: 400 });
  }
  const id = Number(idParam);

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = updateJobSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid job update.", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const mechanic = await prisma.mechanic.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!mechanic) return Response.json({ error: "Mechanic profile was not found." }, { status: 404 });

    const job = await prisma.$transaction(async (transaction) => {
      const assignedJob = await transaction.jobCard.findFirst({
        where: { id, mechanicId: mechanic.id },
        select: {
          id: true,
          status: true,
          workDone: true,
          startedAt: true,
          appointment: { select: { status: true } },
          quotation: {
            select: {
              id: true,
              status: true,
              totalAmount: true,
              items: { select: { itemType: true, partId: true, description: true, quantity: true, unitPrice: true, discountAmount: true, lineTotal: true } },
            },
          },
        },
      });
      if (!assignedJob) return null;
      if (["QUALITY_CHECK", "COMPLETED", "DELIVERED", "CANCELLED"].includes(assignedJob.status)) {
        throw new Error("JOB_ALREADY_COMPLETED");
      }
      if (assignedJob.appointment.status === "CANCELLED" || assignedJob.appointment.status === "NO_SHOW") {
        throw new Error("APPOINTMENT_CLOSED");
      }
      if (
        (parsed.data.status === "IN_PROGRESS" || parsed.data.status === "QUALITY_CHECK" || !!parsed.data.partsUsed?.length || parsed.data.workDone !== undefined) &&
        assignedJob.quotation?.status !== "APPROVED"
      ) {
        throw new Error("QUOTATION_APPROVAL_REQUIRED");
      }
      if (
        parsed.data.status === "IN_PROGRESS" &&
        assignedJob.appointment.status !== "CHECKED_IN" &&
        assignedJob.appointment.status !== "IN_SERVICE"
      ) {
        throw new Error("APPOINTMENT_NOT_CHECKED_IN");
      }
      if (parsed.data.status === "QUALITY_CHECK" && assignedJob.status !== "IN_PROGRESS") {
        throw new Error("JOB_MUST_BE_IN_PROGRESS");
      }
      if (parsed.data.status === "QUALITY_CHECK" && !(parsed.data.workDone ?? assignedJob.workDone)?.trim()) {
        throw new Error("WORK_DESCRIPTION_REQUIRED");
      }

      const requestedParts = parsed.data.partsUsed ?? [];
      if (requestedParts.length) {
        const approvedQuantities = new Map(
          (assignedJob.quotation?.items ?? []).flatMap((item) =>
            item.itemType === "PART" && item.partId !== null ? [[item.partId, item.quantity.toNumber()] as const] : [],
          ),
        );
        const previouslyUsed = await transaction.jobCardPart.findMany({
          where: { jobCardId: id },
          select: { partId: true, quantity: true },
        });
        const usedQuantities = new Map(previouslyUsed.map((part) => [part.partId, part.quantity]));
        for (const usage of requestedParts) {
          const newTotal = (usedQuantities.get(usage.partId) ?? 0) + usage.quantity;
          if (newTotal > (approvedQuantities.get(usage.partId) ?? 0)) throw new Error("PART_NOT_APPROVED");
          usedQuantities.set(usage.partId, newTotal);
        }
      }

      for (const usage of requestedParts) {
        const changed = await transaction.sparePart.updateMany({
          where: { id: usage.partId, quantity: { gte: usage.quantity } },
          data: { quantity: { decrement: usage.quantity } },
        });
        if (changed.count === 0) {
          const part = await transaction.sparePart.findUnique({ where: { id: usage.partId }, select: { id: true } });
          throw new Error(part ? `INSUFFICIENT_STOCK:${usage.partId}` : `PART_NOT_FOUND:${usage.partId}`);
        }

        await transaction.jobCardPart.upsert({
          where: { jobCardId_partId: { jobCardId: id, partId: usage.partId } },
          create: { jobCardId: id, partId: usage.partId, quantity: usage.quantity },
          update: { quantity: { increment: usage.quantity } },
        });
        await transaction.inventoryTransaction.create({
          data: {
            partId: usage.partId,
            quantity: usage.quantity,
            transactionType: "OUT",
            note: `Used on job card JC-${id}`,
            createdByUserId: user.id,
          },
        });
      }

      const updatedJob = await transaction.jobCard.update({
        where: { id },
        data: {
          ...(parsed.data.diagnosis !== undefined ? { diagnosis: parsed.data.diagnosis } : {}),
          ...(parsed.data.workDone !== undefined ? { workDone: parsed.data.workDone } : {}),
          ...(!parsed.data.status && parsed.data.diagnosis?.trim() && ["WAITING", "INSPECTION", "DIAGNOSIS"].includes(assignedJob.status)
            ? { status: "DIAGNOSIS" as const }
            : {}),
          ...(parsed.data.status ? { status: parsed.data.status } : {}),
          ...(parsed.data.status === "IN_PROGRESS" && !assignedJob.startedAt ? { startedAt: new Date() } : {}),
          ...(parsed.data.status === "QUALITY_CHECK" ? { workCompletedAt: new Date() } : {}),
        },
        include: {
          appointment: {
            include: {
              customer: { select: { id: true } },
              vehicle: { select: { id: true } },
              service: { select: { name: true, price: true } },
            },
          },
          parts: { include: { part: { select: { name: true, unitPrice: true } } } },
        },
      });

      if (parsed.data.status === "IN_PROGRESS" && assignedJob.appointment.status === "CHECKED_IN") {
        await transaction.appointment.update({
          where: { id: updatedJob.appointmentId },
          data: { status: "IN_SERVICE" },
        });
      }

      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: parsed.data.status === "QUALITY_CHECK" ? "JOB_CARD_READY_FOR_QUALITY_CHECK" : "JOB_CARD_UPDATED",
          entityType: "JobCard",
          entityId: updatedJob.id,
          request,
          details: {
            status: updatedJob.status,
            partsUsedCount: parsed.data.partsUsed?.length ?? 0,
          },
        }),
      });

      return transaction.jobCard.findUnique({
        where: { id },
        include: {
          appointment: {
            include: {
              customer: { select: { name: true, email: true } },
              vehicle: { select: { registrationNumber: true, make: true, model: true } },
              service: { select: { name: true } },
            },
          },
          parts: { include: { part: { select: { name: true, partNumber: true, unitPrice: true } } } },
          invoice: { select: { id: true, totalAmount: true } },
        },
      });
    });

    if (!job) return Response.json({ error: "Assigned job card was not found." }, { status: 404 });
    return Response.json({ job });
  } catch (error) {
    if (error instanceof Error && error.message === "JOB_ALREADY_COMPLETED") {
      return Response.json({ error: "A completed job card cannot be changed." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "WORK_DESCRIPTION_REQUIRED") {
      return Response.json({ error: "Add the work performed before sending this job to quality check." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "JOB_MUST_BE_IN_PROGRESS") {
      return Response.json({ error: "Start the approved repair before requesting a quality check." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "APPOINTMENT_NOT_CHECKED_IN") {
      return Response.json({ error: "The service advisor must check in the vehicle before work can start." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "APPOINTMENT_CLOSED") {
      return Response.json({ error: "A cancelled or missed appointment cannot be worked on." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "QUOTATION_APPROVAL_REQUIRED") {
      return Response.json({ error: "Customer approval of a quotation is required before repair work or parts consumption can begin." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "PART_NOT_APPROVED") {
      return Response.json({ error: "The requested spare-part quantity exceeds the customer-approved quotation." }, { status: 409 });
    }
    if (error instanceof Error && error.message.startsWith("INSUFFICIENT_STOCK:")) {
      return Response.json({ error: "There is not enough stock for one or more selected parts." }, { status: 409 });
    }
    if (error instanceof Error && error.message.startsWith("PART_NOT_FOUND:")) {
      return Response.json({ error: "One or more selected spare parts were not found." }, { status: 404 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return Response.json({ error: "Job card or spare part was not found." }, { status: 404 });
    }
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable." }, { status: 503 });
    }
    console.error("Mechanic job update failed.", error);
    return Response.json({ error: "Job card could not be updated." }, { status: 500 });
  }
}
