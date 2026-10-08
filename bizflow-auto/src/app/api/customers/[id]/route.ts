import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(2).max(255).optional(),
    phone: z.string().trim().min(5).max(50).optional(),
    whatsappOptIn: z.boolean().optional(),
    email: z.union([z.string().trim().email().max(255), z.literal("")]).optional(),
    address: z.string().trim().max(255).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");

type RouteContext = { params: Promise<{ id: string }> };

async function getCustomerId(context: RouteContext) {
  const { id } = await context.params;
  if (!/^[1-9]\d*$/.test(id)) return null;

  const parsedId = Number(id);
  return Number.isSafeInteger(parsedId) ? parsedId : null;
}

export async function GET(_request: Request, context: RouteContext) {
  const user = await requirePermission("customers:read");
  if (user instanceof Response) return user;

  const id = await getCustomerId(context);
  if (id === null) return Response.json({ error: "Invalid customer ID." }, { status: 400 });

  try {
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        vehicles: {
          select: { id: true, registrationNumber: true, make: true, model: true, year: true, mileage: true },
        },
      },
    });

    if (!customer) return Response.json({ error: "Customer not found." }, { status: 404 });
    return Response.json({ customer });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable. Check the server connection." }, { status: 503 });
    }

    console.error("Customer query failed.", error);
    return Response.json({ error: "Customer could not be loaded." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await requirePermission("customers:write");
  if (user instanceof Response) return user;

  const id = await getCustomerId(context);
  if (id === null) return Response.json({ error: "Invalid customer ID." }, { status: 400 });

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = updateCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid customer details.", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const data = {
    ...parsed.data,
    ...(parsed.data.email !== undefined ? { email: parsed.data.email || null } : {}),
  };

  try {
    const customer = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.customer.update({ where: { id }, data });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "CUSTOMER_UPDATED",
          entityType: "Customer",
          entityId: updated.id,
          request,
          details: { fields: Object.keys(data).join(",") },
        }),
      });
      return updated;
    });
    return Response.json({ customer });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return Response.json({ error: "Customer not found." }, { status: 404 });
    }
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable. Check the server connection." }, { status: 503 });
    }

    console.error("Customer update failed.", error);
    return Response.json({ error: "Customer could not be updated." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await requirePermission("customers:delete");
  if (user instanceof Response) return user;

  const id = await getCustomerId(context);
  if (id === null) return Response.json({ error: "Invalid customer ID." }, { status: 400 });

  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.customer.delete({ where: { id } });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "CUSTOMER_DELETED",
          entityType: "Customer",
          entityId: id,
          request,
        }),
      });
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return Response.json({ error: "Customer not found." }, { status: 404 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return Response.json(
        { error: "This customer has linked records and cannot be deleted." },
        { status: 409 },
      );
    }
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable. Check the server connection." }, { status: 503 });
    }

    console.error("Customer deletion failed.", error);
    return Response.json({ error: "Customer could not be deleted." }, { status: 500 });
  }
}
