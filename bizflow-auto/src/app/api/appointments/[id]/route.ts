import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { sendEmailNotification } from "@/lib/email";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const updateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("CANCEL") }),
  z.object({ action: z.literal("NO_SHOW") }),
  z.object({ action: z.literal("START_SERVICE") }),
  z.object({
    action: z.literal("RESCHEDULE"),
    date: z.string().date(),
    time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  }),
]);

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const user = await requirePermission("appointments:write");
  if (user instanceof Response) return user;

  const { id: rawId } = await context.params;
  if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) {
    return Response.json({ error: "Invalid appointment ID." }, { status: 400 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Invalid appointment update.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.appointment.findUnique({
        where: { id: Number(rawId) },
        select: {
          id: true,
          status: true,
          appointmentDate: true,
          appointmentTime: true,
          jobCard: { select: { id: true, status: true, quotation: { select: { status: true } } } },
        },
      });
      if (!existing) throw new Error("APPOINTMENT_NOT_FOUND");

      const updateData: {
        status?: typeof existing.status;
        appointmentDate?: Date;
        appointmentTime?: Date;
      } = {};
      const action = parsed.data.action;

      if (action === "CANCEL") {
        if (existing.status !== "REQUESTED" && existing.status !== "CONFIRMED") throw new Error("APPOINTMENT_CANNOT_CANCEL");
        updateData.status = "CANCELLED";
      } else if (action === "NO_SHOW") {
        if (existing.status !== "REQUESTED" && existing.status !== "CONFIRMED") throw new Error("APPOINTMENT_CANNOT_MARK_NO_SHOW");
        const scheduledAt = new Date(
          `${existing.appointmentDate.toISOString().slice(0, 10)}T${existing.appointmentTime.toISOString().slice(11, 19)}Z`,
        );
        if (scheduledAt > new Date()) throw new Error("APPOINTMENT_NOT_DUE");
        updateData.status = "NO_SHOW";
      } else if (action === "START_SERVICE") {
        if (existing.status !== "CHECKED_IN") throw new Error("APPOINTMENT_CANNOT_START_SERVICE");
        if (!existing.jobCard) throw new Error("JOB_CARD_REQUIRED");
        if (!["WAITING", "INSPECTION", "DIAGNOSIS", "AWAITING_APPROVAL"].includes(existing.jobCard.status)) {
          throw new Error("JOB_NOT_READY_TO_START");
        }
        if (existing.jobCard.quotation?.status !== "APPROVED") throw new Error("QUOTATION_APPROVAL_REQUIRED");
        updateData.status = "IN_SERVICE";
        await transaction.jobCard.update({
          where: { id: existing.jobCard.id },
          data: { status: "IN_PROGRESS", startedAt: new Date() },
        });
      } else {
        if (existing.jobCard || (existing.status !== "REQUESTED" && existing.status !== "CONFIRMED")) {
          throw new Error("APPOINTMENT_CANNOT_RESCHEDULE");
        }
        const appointmentDate = new Date(`${parsed.data.date}T00:00:00.000Z`);
        if (appointmentDate < new Date(new Date().toISOString().slice(0, 10))) {
          throw new Error("APPOINTMENT_DATE_IN_PAST");
        }
        updateData.appointmentDate = appointmentDate;
        updateData.appointmentTime = new Date(`1970-01-01T${parsed.data.time}:00.000Z`);
      }

      const updated = await transaction.appointment.update({
        where: { id: existing.id },
        data: updateData,
        include: {
          customer: { select: { name: true, email: true } },
          vehicle: { select: { registrationNumber: true } },
          service: { select: { name: true } },
          advisor: { select: { id: true, name: true } },
          jobCard: { select: { id: true, status: true, mechanic: { select: { id: true, name: true } } } },
        },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: {
            CANCEL: "APPOINTMENT_CANCELLED",
            NO_SHOW: "APPOINTMENT_MARKED_NO_SHOW",
            START_SERVICE: "APPOINTMENT_SERVICE_STARTED",
            RESCHEDULE: "APPOINTMENT_RESCHEDULED",
          }[action],
          entityType: "Appointment",
          entityId: updated.id,
          request,
          details: {
            previousStatus: existing.status,
            status: updated.status,
            ...(action === "RESCHEDULE" ? { date: parsed.data.date, time: parsed.data.time } : {}),
          },
        }),
      });
      return { appointment: updated, action };
    });

    let emailNotification: Awaited<ReturnType<typeof sendEmailNotification>> | undefined;
    if (result.action === "CANCEL" || result.action === "NO_SHOW" || result.action === "RESCHEDULE") {
      const date = result.appointment.appointmentDate.toISOString().slice(0, 10);
      const time = result.appointment.appointmentTime.toISOString().slice(11, 16);
      const message = result.action === "CANCEL"
        ? "has been cancelled"
        : result.action === "NO_SHOW"
          ? "was marked as a no-show"
          : `has been rescheduled to ${date} at ${time}`;
      emailNotification = await sendEmailNotification({
        to: result.appointment.customer.email,
        subject: `Appointment update #${result.appointment.id}`,
        text: `Hello ${result.appointment.customer.name}, your ${result.appointment.service.name} appointment for ${result.appointment.vehicle.registrationNumber} ${message}.`,
      });
    }
    return Response.json({ appointment: result.appointment, emailNotification });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "APPOINTMENT_NOT_FOUND") return Response.json({ error: "Appointment was not found." }, { status: 404 });
      if (error.message === "APPOINTMENT_DATE_IN_PAST") return Response.json({ error: "Appointment date cannot be in the past." }, { status: 400 });
      if (error.message === "APPOINTMENT_NOT_DUE") return Response.json({ error: "An appointment cannot be marked as a no-show before its scheduled time." }, { status: 409 });
      if (error.message === "JOB_CARD_REQUIRED") return Response.json({ error: "Assign a mechanic and create a job card before starting service." }, { status: 409 });
      if (error.message === "QUOTATION_APPROVAL_REQUIRED") return Response.json({ error: "Customer approval of a quotation is required before service can start." }, { status: 409 });
      if (error.message === "JOB_NOT_READY_TO_START") return Response.json({ error: "The assigned job card is not ready to start repair work." }, { status: 409 });
      if (error.message.startsWith("APPOINTMENT_CANNOT_")) return Response.json({ error: "This appointment cannot transition to that state." }, { status: 409 });
    }
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Appointment update failed.", error);
    return Response.json({ error: "Appointment could not be updated." }, { status: 500 });
  }
}
