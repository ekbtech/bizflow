import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { getSessionUser, isDatabaseUnavailable } from "@/lib/auth";
import { sendEmailNotification } from "@/lib/email";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const appointmentSchema = z.object({
  vehicleId: z.coerce.number().int().positive(),
  serviceId: z.coerce.number().int().positive(),
  date: z.string().date(),
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  description: z.string().trim().max(2000).optional(),
});

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "CUSTOMER") {
    return Response.json({ error: "You do not have permission to view customer appointments." }, { status: 403 });
  }

  try {
    const appointments = await prisma.appointment.findMany({
      where: { customer: { userId: user.id } },
      orderBy: [{ appointmentDate: "desc" }, { appointmentTime: "desc" }],
      include: {
        service: { select: { name: true, price: true } },
        vehicle: { select: { registrationNumber: true, make: true, model: true } },
        jobCard: { select: { status: true, diagnosis: true, workDone: true } },
      },
    });
    return Response.json({ appointments });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable." }, { status: 503 });
    }
    console.error("Customer appointment list query failed.", error);
    return Response.json({ error: "Appointments could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "CUSTOMER") {
    return Response.json({ error: "Only customer accounts can book appointments." }, { status: 403 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = appointmentSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid appointment details.", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const customer = await prisma.customer.findUnique({
      where: { userId: user.id },
      select: { id: true, name: true },
    });
    if (!customer) return Response.json({ error: "Customer profile was not found." }, { status: 404 });

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: parsed.data.vehicleId, customerId: customer.id },
      select: { id: true },
    });
    if (!vehicle) return Response.json({ error: "That vehicle is not linked to your account." }, { status: 403 });

    const service = await prisma.service.findUnique({
      where: { id: parsed.data.serviceId },
      select: { id: true },
    });
    if (!service) return Response.json({ error: "Selected service was not found." }, { status: 404 });

    const appointmentDate = new Date(`${parsed.data.date}T00:00:00.000Z`);
    if (appointmentDate < new Date(new Date().toISOString().slice(0, 10))) {
      return Response.json({ error: "Appointment date cannot be in the past." }, { status: 400 });
    }

    const appointment = await prisma.$transaction(async (transaction) => {
      const created = await transaction.appointment.create({
        data: {
          customerId: customer.id,
          vehicleId: vehicle.id,
          serviceId: service.id,
          appointmentDate,
          appointmentTime: new Date(`1970-01-01T${parsed.data.time}:00.000Z`),
          description: parsed.data.description || null,
        },
        include: {
          service: { select: { name: true, price: true } },
          vehicle: { select: { registrationNumber: true } },
        },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "APPOINTMENT_REQUESTED",
          entityType: "Appointment",
          entityId: created.id,
          request,
        }),
      });
      return created;
    });
    const emailNotification = await sendEmailNotification({
      to: process.env.GARAGE_NOTIFICATION_EMAIL,
      subject: `New appointment request #${appointment.id}`,
      text: `${customer.name} requested ${appointment.service.name} for ${appointment.vehicle.registrationNumber} on ${parsed.data.date} at ${parsed.data.time}. Review the request in the BizFlow Auto appointments page.`,
    });
    return Response.json({ appointment, emailNotification }, { status: 201 });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable." }, { status: 503 });
    }
    console.error("Appointment booking failed.", error);
    return Response.json({ error: "Appointment could not be booked." }, { status: 500 });
  }
}
