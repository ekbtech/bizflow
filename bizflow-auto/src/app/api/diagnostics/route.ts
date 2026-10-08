import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const diagnosticSchema = z.object({
  appointmentId: z.number().int().positive(),
  procedure: z.string().trim().max(5000).nullable().optional().transform((value) => value || ""),
  faultCodes: z.string().trim().max(5000).nullable().optional().transform((value) => value || null),
  symptoms: z.string().trim().max(5000).nullable().optional().transform((value) => value || null),
  diagnosis: z.string().trim().max(5000).nullable().optional().transform((value) => value || ""),
  recommendedRepair: z.string().trim().max(5000).nullable().optional().transform((value) => value || ""),
  diagnosticMinutes: z.number().int().min(1).max(1440),
});

export async function GET() {
  const user = await requirePermission("diagnostics:read");
  if (user instanceof Response) return user;

  const mechanicFilter: Prisma.JobCardWhereInput = user.role === "MECHANIC"
    ? { mechanic: { is: { userId: user.id } } }
    : {};
  const appointmentFilter: Prisma.AppointmentWhereInput = {
    status: { in: ["CHECKED_IN", "IN_SERVICE"] },
    reception: { is: { inspection: { isNot: null } } },
    ...(user.role === "MECHANIC" ? { jobCard: { is: mechanicFilter } } : {}),
  };

  try {
    const [records, eligibleAppointments] = await Promise.all([
      prisma.diagnosticRecord.findMany({
        where: user.role === "MECHANIC" ? { jobCard: { is: mechanicFilter } } : {},
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          appointment: {
            include: {
              customer: { select: { name: true } },
              vehicle: { select: { registrationNumber: true, make: true, model: true } },
              service: { select: { name: true } },
            },
          },
          jobCard: { select: { id: true, mechanic: { select: { name: true } } } },
        },
      }),
      prisma.appointment.findMany({
        where: appointmentFilter,
        orderBy: [{ appointmentDate: "asc" }, { appointmentTime: "asc" }],
        take: 100,
        include: {
          customer: { select: { name: true } },
          vehicle: { select: { registrationNumber: true, make: true, model: true } },
          service: { select: { name: true } },
          jobCard: { select: { id: true, status: true, mechanic: { select: { name: true, userId: true } } } },
          reception: { select: { id: true, complaint: true, inspection: { select: { id: true } } } },
        },
      }),
    ]);
    return Response.json({ diagnostics: records, eligibleAppointments });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Diagnostic records could not be loaded.", error);
    return Response.json({ error: "Diagnostic records could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requirePermission("diagnostics:write");
  if (user instanceof Response) return user;

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = diagnosticSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Invalid diagnostic details.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: parsed.data.appointmentId },
      select: {
        id: true,
        status: true,
        reception: { select: { id: true, complaint: true, inspection: { select: { id: true } } } },
        jobCard: { select: { id: true, status: true, mechanic: { select: { name: true, userId: true } } } },
      },
    });
    if (!appointment) return Response.json({ error: "Appointment was not found." }, { status: 404 });
    const reception = appointment.reception;
    if (!["CHECKED_IN", "IN_SERVICE"].includes(appointment.status) || !reception?.inspection) {
      return Response.json({ error: "A vehicle reception and inspection are required before diagnostics." }, { status: 409 });
    }
    if (user.role === "MECHANIC" && appointment.jobCard?.mechanic.userId !== user.id) {
      return Response.json({ error: "Mechanics can only record diagnostics for their assigned jobs." }, { status: 403 });
    }

    const diagnostic = await prisma.$transaction(async (transaction) => {
      const created = await transaction.diagnosticRecord.create({
        data: {
          appointmentId: appointment.id,
          jobCardId: appointment.jobCard?.id ?? null,
          technicianName: user.name,
          complaint: reception.complaint,
          procedure: parsed.data.procedure,
          faultCodes: parsed.data.faultCodes,
          symptoms: parsed.data.symptoms,
          diagnosis: parsed.data.diagnosis,
          recommendedRepair: parsed.data.recommendedRepair,
          diagnosticMinutes: parsed.data.diagnosticMinutes,
        },
      });
      if (appointment.jobCard && ["WAITING", "INSPECTION", "DIAGNOSIS"].includes(appointment.jobCard.status)) {
        await transaction.jobCard.updateMany({
          where: { id: appointment.jobCard.id, status: { in: ["WAITING", "INSPECTION", "DIAGNOSIS"] } },
          data: { status: "DIAGNOSIS" },
        });
      }
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "DIAGNOSTIC_RECORD_CREATED",
          entityType: "DiagnosticRecord",
          entityId: created.id,
          request,
          details: {
            appointmentId: appointment.id,
            jobCardId: appointment.jobCard?.id ?? null,
            diagnosticMinutes: created.diagnosticMinutes,
          },
        }),
      });
      return created;
    });
    return Response.json({ diagnostic }, { status: 201 });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Diagnostic record could not be created.", error);
    return Response.json({ error: "Diagnostic record could not be created." }, { status: 500 });
  }
}
