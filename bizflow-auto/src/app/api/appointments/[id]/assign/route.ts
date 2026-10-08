import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { sendEmailNotification } from "@/lib/email";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const assignSchema = z.object({
  mechanicId: z.number().int().positive(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const user = await requirePermission("jobCards:manage");
  if (user instanceof Response) return user;

  const { id: idParam } = await context.params;
  if (!/^[1-9]\d*$/.test(idParam) || !Number.isSafeInteger(Number(idParam))) {
    return Response.json({ error: "Invalid appointment ID." }, { status: 400 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "A valid mechanic ID is required." }, { status: 400 });
  }

  try {
    const jobCard = await prisma.$transaction(async (transaction) => {
      const appointment = await transaction.appointment.findUnique({
        where: { id: Number(idParam) },
        select: { id: true, status: true },
      });
      if (!appointment) throw new Error("APPOINTMENT_NOT_FOUND");
      if (appointment.status === "CANCELLED" || appointment.status === "NO_SHOW") throw new Error("APPOINTMENT_CLOSED");
      if (appointment.status === "IN_SERVICE" || appointment.status === "COMPLETED") throw new Error("APPOINTMENT_ALREADY_STARTED");

      await transaction.mechanic.findUniqueOrThrow({
        where: { id: parsed.data.mechanicId },
        select: { id: true },
      });
      const approvedQuotation = await transaction.quotation.findFirst({
        where: { appointmentId: appointment.id, status: "APPROVED" },
        orderBy: { approvedAt: "desc" },
        select: { id: true },
      });
      const job = await transaction.jobCard.upsert({
        where: { appointmentId: appointment.id },
        create: {
          appointmentId: appointment.id,
          mechanicId: parsed.data.mechanicId,
          quotationId: approvedQuotation?.id ?? null,
        },
        update: {
          mechanicId: parsed.data.mechanicId,
          ...(approvedQuotation ? { quotationId: approvedQuotation.id } : {}),
        },
      });
      await transaction.appointment.update({
        where: { id: appointment.id },
        data: { ...(appointment.status === "REQUESTED" ? { status: "CONFIRMED" } : {}) },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "JOB_CARD_ASSIGNED",
          entityType: "JobCard",
          entityId: job.id,
          request,
          details: { mechanicId: parsed.data.mechanicId, appointmentId: appointment.id },
        }),
      });
      return job;
    });

    const appointment = await prisma.appointment.findUnique({
      where: { id: Number(idParam) },
      include: {
        customer: { select: { name: true, email: true } },
        vehicle: { select: { registrationNumber: true } },
        service: { select: { name: true } },
      },
    });
    const emailNotification = await sendEmailNotification({
      to: appointment?.customer.email,
      subject: `Appointment confirmed #${idParam}`,
      text: `Hello ${appointment?.customer.name ?? ""}, your ${appointment?.service.name ?? "service"} appointment for ${appointment?.vehicle.registrationNumber ?? "your vehicle"} is confirmed. A mechanic has been assigned. Contact the garage if you need to change the booking.`,
    });
    return Response.json({ jobCard, emailNotification }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "APPOINTMENT_NOT_FOUND") {
      return Response.json({ error: "Appointment was not found." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "APPOINTMENT_CLOSED") {
      return Response.json({ error: "A cancelled or missed appointment cannot be assigned." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "APPOINTMENT_ALREADY_STARTED") {
      return Response.json({ error: "A service that has started or completed cannot be reassigned." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return Response.json({ error: "Mechanic was not found." }, { status: 404 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "A job card already exists for this appointment." }, { status: 409 });
    }
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable." }, { status: 503 });
    }
    console.error("Appointment assignment failed.", error);
    return Response.json({ error: "Appointment could not be assigned." }, { status: 500 });
  }
}
