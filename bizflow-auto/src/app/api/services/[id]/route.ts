import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const updateServiceSchema = z
  .object({
    name: z.string().trim().min(2).max(255).optional(),
    price: z.coerce.number().positive().max(10_000_000).optional(),
    category: z.string().trim().min(2).max(100).optional(),
    vehicleType: z.enum(["CAR", "BICYCLE", "MOTORBIKE", "UNIVERSAL"]).optional(),
    mechanicSpecialty: z.string().trim().min(2).max(120).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "At least one field is required.");

type RouteContext = { params: Promise<{ id: string }> };

async function readId(context: RouteContext) {
  const { id } = await context.params;
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) return null;
  return Number(id);
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await requirePermission("services:write");
  if (user instanceof Response) return user;

  const id = await readId(context);
  if (id === null) return Response.json({ error: "Invalid service ID." }, { status: 400 });

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = updateServiceSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid service details.", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const service = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.service.update({
        where: { id },
        data: {
          ...parsed.data,
          ...(parsed.data.price !== undefined ? { priceConfigured: true } : {}),
        },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "SERVICE_UPDATED",
          entityType: "Service",
          entityId: updated.id,
          request,
          details: { fields: Object.keys(parsed.data).join(",") },
        }),
      });
      return updated;
    });
    return Response.json({ service });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return Response.json({ error: "Service was not found." }, { status: 404 });
    }
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable." }, { status: 503 });
    }
    console.error("Service update failed.", error);
    return Response.json({ error: "Service could not be updated." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await requirePermission("services:delete");
  if (user instanceof Response) return user;

  const id = await readId(context);
  if (id === null) return Response.json({ error: "Invalid service ID." }, { status: 400 });

  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.service.delete({ where: { id } });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "SERVICE_DELETED",
          entityType: "Service",
          entityId: id,
          request,
        }),
      });
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return Response.json({ error: "Service was not found." }, { status: 404 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return Response.json({ error: "This service has appointment history and cannot be deleted." }, { status: 409 });
    }
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable." }, { status: 503 });
    }
    console.error("Service deletion failed.", error);
    return Response.json({ error: "Service could not be deleted." }, { status: 500 });
  }
}
