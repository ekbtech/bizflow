import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmailNotification } from "@/lib/email";

export const runtime = "nodejs";

const createSchema = z.object({
  customerId: z.number().int().positive(),
  vehicleId: z.number().int().positive(),
  serviceId: z.number().int().positive(),
  date: z.string().date(),
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  advisorUserId: z.number().int().positive().nullable().optional(),
});

export async function GET() {
  const user = await requirePermission("appointments:read");
  if (user instanceof Response) return user;

  try {
    const [appointments, advisors] = await Promise.all([
      prisma.appointment.findMany({
        orderBy: [{ appointmentDate: "desc" }, { appointmentTime: "desc" }],
        take: 100,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } },
          service: { select: { id: true, name: true, price: true } },
          advisor: { select: { id: true, name: true } },
          jobCard: { select: { id: true, status: true, mechanic: { select: { id: true, name: true } } } },
        },
      }),
      prisma.user.findMany({
        where: { role: { in: ["ADMIN", "SUPER_ADMIN", "GARAGE_MANAGER", "SERVICE_ADVISOR"] } },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);
    return Response.json({ appointments, advisors });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable." }, { status: 503 });
    }
    console.error("Appointment list query failed.", error);
    return Response.json({ error: "Appointments could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requirePermission("appointments:write");
  if (user instanceof Response) return user;

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid appointment details.", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const appointmentDate = new Date(`${parsed.data.date}T00:00:00.000Z`);
  if (appointmentDate < new Date(new Date().toISOString().slice(0, 10))) {
    return Response.json({ error: "Appointment date cannot be in the past." }, { status: 400 });
  }

  const advisorUserId = parsed.data.advisorUserId ?? user.id;

  try {
    const [customer, vehicle, service, advisor] = await Promise.all([
      prisma.customer.findUnique({ where: { id: parsed.data.customerId }, select: { id: true, name: true, email: true } }),
      prisma.vehicle.findFirst({
        where: { id: parsed.data.vehicleId, customerId: parsed.data.customerId },
        select: { id: true, registrationNumber: true },
      }),
      prisma.service.findUnique({ where: { id: parsed.data.serviceId }, select: { id: true, name: true } }),
      advisorUserId === null
        ? Promise.resolve(null)
        : prisma.user.findFirst({
            where: { id: advisorUserId, role: { in: ["ADMIN", "SUPER_ADMIN", "GARAGE_MANAGER", "SERVICE_ADVISOR"] } },
            select: { id: true },
          }),
    ]);
    if (!customer) return Response.json({ error: "Customer was not found." }, { status: 404 });
    if (!vehicle) return Response.json({ error: "Selected vehicle does not belong to that customer." }, { status: 400 });
    if (!service) return Response.json({ error: "Selected service was not found." }, { status: 404 });
    if (advisorUserId !== null && !advisor) return Response.json({ error: "Selected advisor is not available." }, { status: 400 });

    const appointment = await prisma.$transaction(async (transaction) => {
      const created = await transaction.appointment.create({
        data: {
          customerId: customer.id,
          vehicleId: vehicle.id,
          serviceId: service.id,
          advisorUserId,
          priority: parsed.data.priority,
          appointmentDate,
          appointmentTime: new Date(`1970-01-01T${parsed.data.time}:00.000Z`),
          description: parsed.data.description || null,
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } },
          service: { select: { id: true, name: true, price: true } },
          advisor: { select: { id: true, name: true } },
        },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "APPOINTMENT_CREATED",
          entityType: "Appointment",
          entityId: created.id,
          request,
          details: { priority: created.priority, advisorUserId: created.advisorUserId },
        }),
      });
      return created;
    });
    const emailNotification = await sendEmailNotification({
      to: customer.email,
      subject: `Appointment requested #${appointment.id}`,
      text: `Hello ${customer.name}, your ${service.name} appointment for ${vehicle.registrationNumber} is requested for ${parsed.data.date} at ${parsed.data.time}. The garage will confirm your booking.`,
    });
    return Response.json({ appointment, emailNotification }, { status: 201 });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable." }, { status: 503 });
    }
    console.error("Staff appointment creation failed.", error);
    return Response.json({ error: "Appointment could not be created." }, { status: 500 });
  }
}
