import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const vehicleSchema = z.object({
  customerId: z.number().int().positive().optional(),
  registrationNumber: z.string().trim().min(2).max(50).optional(),
  make: z.string().trim().min(1).max(100).optional(),
  model: z.string().trim().min(1).max(100).optional(),
  year: z.number().int().min(1886).max(new Date().getFullYear() + 1).optional(),
  color: z.string().trim().max(50).nullable().optional(),
  mileage: z.number().int().min(0).max(2_000_000).optional(),
}).refine((data) => Object.keys(data).length > 0, "At least one field is required.");

type RouteContext = { params: Promise<{ id: string }> };

async function parseId(context: RouteContext) {
  const { id } = await context.params;
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) return null;
  return Number(id);
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await requirePermission("vehicles:write");
  if (user instanceof Response) return user;
  const id = await parseId(context);
  if (id === null) return Response.json({ error: "Invalid vehicle ID." }, { status: 400 });

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = vehicleSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Invalid vehicle details.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const data = {
      ...parsed.data,
      ...(parsed.data.registrationNumber !== undefined
        ? { registrationNumber: parsed.data.registrationNumber.toUpperCase() }
        : {}),
      ...(parsed.data.color !== undefined ? { color: parsed.data.color || null } : {}),
    };
    const vehicle = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.vehicle.update({
        where: { id },
        data,
        include: { customer: { select: { id: true, name: true, phone: true } } },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "VEHICLE_UPDATED",
          entityType: "Vehicle",
          entityId: updated.id,
          request,
          details: { fields: Object.keys(data).join(",") },
        }),
      });
      return updated;
    });
    return Response.json({ vehicle });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "That registration number is already registered." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return Response.json({ error: "Vehicle or customer profile was not found." }, { status: 404 });
    }
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Vehicle update failed.", error);
    return Response.json({ error: "Vehicle could not be updated." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await requirePermission("vehicles:delete");
  if (user instanceof Response) return user;
  const id = await parseId(context);
  if (id === null) return Response.json({ error: "Invalid vehicle ID." }, { status: 400 });

  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.vehicle.delete({ where: { id } });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "VEHICLE_DELETED",
          entityType: "Vehicle",
          entityId: id,
          request,
        }),
      });
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return Response.json({ error: "Vehicle not found." }, { status: 404 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return Response.json({ error: "This vehicle has linked appointments or invoices and cannot be deleted." }, { status: 409 });
    }
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Vehicle deletion failed.", error);
    return Response.json({ error: "Vehicle could not be deleted." }, { status: 500 });
  }
}
