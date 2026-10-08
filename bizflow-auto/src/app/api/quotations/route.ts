import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { quoteExpiry } from "@/lib/quotation";

export const runtime = "nodejs";

const createSchema = z.object({
  appointmentId: z.number().int().positive(),
  expiresAt: z.string().date(),
  notes: z.string().trim().max(5000).optional(),
});

export async function GET() {
  const user = await requirePermission("quotations:read");
  if (user instanceof Response) return user;

  try {
    const now = new Date();
    const expiredQuotations = await prisma.quotation.findMany({
      where: { status: "SENT", expiresAt: { lte: now } },
      select: { appointmentId: true },
    });
    await prisma.quotation.updateMany({
      where: { status: "SENT", expiresAt: { lte: now } },
      data: { status: "EXPIRED", approvalTokenHash: null },
    });
    const expiredAppointmentIds = [...new Set(expiredQuotations.map((quote) => quote.appointmentId))];
    if (expiredAppointmentIds.length) {
      await prisma.jobCard.updateMany({
        where: { appointmentId: { in: expiredAppointmentIds }, status: "AWAITING_APPROVAL" },
        data: { status: "DIAGNOSIS" },
      });
    }
    const [quotations, eligibleAppointments, parts] = await Promise.all([
      prisma.quotation.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          createdBy: { select: { name: true } },
          approvedBy: { select: { name: true } },
          items: { orderBy: { id: "asc" } },
          appointment: {
            include: {
              customer: { select: { name: true, email: true } },
              vehicle: { select: { registrationNumber: true, make: true, model: true } },
              service: { select: { name: true, priceConfigured: true } },
              jobCard: { select: { id: true, status: true, mechanic: { select: { name: true } } } },
            },
          },
        },
      }),
      prisma.appointment.findMany({
        where: {
          status: { in: ["CHECKED_IN", "IN_SERVICE"] },
          reception: { is: { inspection: { isNot: null } } },
          diagnostics: { some: {} },
        },
        orderBy: [{ appointmentDate: "asc" }, { appointmentTime: "asc" }],
        take: 100,
        include: {
          customer: { select: { name: true, email: true } },
          vehicle: { select: { registrationNumber: true, make: true, model: true } },
          service: { select: { name: true, priceConfigured: true } },
          _count: { select: { quotations: true } },
        },
      }),
      prisma.sparePart.findMany({
        where: { quantity: { gt: 0 }, stockCounted: true, priceConfigured: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, partNumber: true, quantity: true, unitPrice: true },
        take: 500,
      }),
    ]);
    return Response.json({ quotations, eligibleAppointments, parts });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Quotation list query failed.", error);
    return Response.json({ error: "Quotations could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requirePermission("quotations:write");
  if (user instanceof Response) return user;

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Invalid quotation details.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const expiresAt = quoteExpiry(parsed.data.expiresAt);
  const now = new Date();
  if (expiresAt <= now || expiresAt.getTime() > now.getTime() + 90 * 24 * 60 * 60 * 1000) {
    return Response.json({ error: "Quotation expiry must be within the next 90 days." }, { status: 400 });
  }

  try {
    const quotation = await prisma.$transaction(async (transaction) => {
      const expired = await transaction.quotation.updateMany({
        where: {
          appointmentId: parsed.data.appointmentId,
          status: "SENT",
          expiresAt: { lte: now },
        },
        data: { status: "EXPIRED", approvalTokenHash: null },
      });
      if (expired.count) {
        await transaction.jobCard.updateMany({
          where: { appointmentId: parsed.data.appointmentId, status: "AWAITING_APPROVAL" },
          data: { status: "DIAGNOSIS" },
        });
      }
      const appointment = await transaction.appointment.findUnique({
        where: { id: parsed.data.appointmentId },
        select: {
          id: true,
          status: true,
          reception: { select: { inspection: { select: { id: true } } } },
          diagnostics: { select: { id: true }, take: 1 },
        },
      });
      if (!appointment) throw new Error("APPOINTMENT_NOT_FOUND");
      if (!["CHECKED_IN", "IN_SERVICE"].includes(appointment.status) || !appointment.reception?.inspection || !appointment.diagnostics.length) {
        throw new Error("QUOTATION_WORKFLOW_INCOMPLETE");
      }
      const active = await transaction.quotation.findFirst({
        where: { appointmentId: appointment.id, status: { in: ["DRAFT", "SENT"] } },
        select: { id: true },
      });
      if (active) throw new Error("ACTIVE_QUOTATION_EXISTS");
      const approved = await transaction.quotation.findFirst({
        where: { appointmentId: appointment.id, status: "APPROVED" },
        select: { id: true },
      });
      if (approved) throw new Error("QUOTATION_ALREADY_APPROVED");

      const created = await transaction.quotation.create({
        data: {
          appointmentId: appointment.id,
          createdByUserId: user.id,
          expiresAt,
          notes: parsed.data.notes?.trim() || null,
        },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "QUOTATION_CREATED",
          entityType: "Quotation",
          entityId: created.id,
          request,
          details: { appointmentId: appointment.id, expiresAt: expiresAt.toISOString() },
        }),
      });
      return created;
    });
    return Response.json({ quotation }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "APPOINTMENT_NOT_FOUND") return Response.json({ error: "Appointment was not found." }, { status: 404 });
      if (error.message === "QUOTATION_WORKFLOW_INCOMPLETE") return Response.json({ error: "Complete the vehicle inspection and diagnostic record before creating a quotation." }, { status: 409 });
      if (error.message === "ACTIVE_QUOTATION_EXISTS") return Response.json({ error: "Finish or expire the existing draft/sent quotation before creating another." }, { status: 409 });
      if (error.message === "QUOTATION_ALREADY_APPROVED") return Response.json({ error: "This appointment already has an approved quotation." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return Response.json({ error: "The appointment could not be linked to a quotation." }, { status: 400 });
    }
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Quotation creation failed.", error);
    return Response.json({ error: "Quotation could not be created." }, { status: 500 });
  }
}
