import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const vehicleSchema = z.object({
  registrationNumber: z.string().trim().min(2).max(50),
  make: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(100),
  year: z.coerce.number().int().min(1886).max(new Date().getFullYear() + 1),
  color: z.string().trim().max(50).optional(),
  mileage: z.coerce.number().int().min(0).max(2_000_000).default(0),
});

export async function GET() {
  const user = await requireRole("CUSTOMER");
  if (user instanceof Response) return user;

  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { customer: { userId: user.id } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        registrationNumber: true,
        make: true,
        model: true,
        year: true,
        color: true,
        mileage: true,
      },
    });
    return Response.json({ vehicles });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable." }, { status: 503 });
    }
    console.error("Customer vehicle list query failed.", error);
    return Response.json({ error: "Vehicles could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requireRole("CUSTOMER");
  if (user instanceof Response) return user;

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = vehicleSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid vehicle details.", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const customer = await prisma.customer.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!customer) return Response.json({ error: "Customer profile was not found." }, { status: 404 });

    const vehicle = await prisma.$transaction(async (transaction) => {
      const created = await transaction.vehicle.create({
        data: {
          ...parsed.data,
          registrationNumber: parsed.data.registrationNumber.toUpperCase(),
          color: parsed.data.color || null,
          customerId: customer.id,
        },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "CUSTOMER_VEHICLE_REGISTERED",
          entityType: "Vehicle",
          entityId: created.id,
          request,
        }),
      });
      return created;
    });
    return Response.json({ vehicle }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "That registration number is already registered." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return Response.json({ error: "Customer profile was not found." }, { status: 404 });
    }
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable." }, { status: 503 });
    }
    console.error("Vehicle creation failed.", error);
    return Response.json({ error: "Vehicle could not be added." }, { status: 500 });
  }
}
