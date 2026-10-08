import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  partNumber: z.string().trim().max(100).nullable().optional(),
  unitPrice: z.number().positive().max(10_000_000).optional(),
  reorderLevel: z.number().int().min(0).max(1_000_000).optional(),
  category: z.string().trim().min(2).max(100).optional(),
  vehicleType: z.enum(["CAR", "BICYCLE", "MOTORBIKE", "UNIVERSAL"]).optional(),
}).refine((data) => Object.keys(data).length > 0, "At least one field is required.");
const restockSchema = z.object({
  quantity: z.number().int().positive().max(1_000_000),
  note: z.string().trim().min(2).max(500).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

async function getId(context: RouteContext) {
  const { id } = await context.params;
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) ? Number(id) : null;
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await requirePermission("spareParts:write");
  if (user instanceof Response) return user;
  const id = await getId(context);
  if (id === null) return Response.json({ error: "Invalid spare-part ID." }, { status: 400 });
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: "Invalid spare-part update.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  try {
    const part = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.sparePart.update({
        where: { id },
        data: {
          ...parsed.data,
          ...(parsed.data.partNumber !== undefined ? { partNumber: parsed.data.partNumber || null } : {}),
          ...(parsed.data.unitPrice !== undefined ? { priceConfigured: true } : {}),
        },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "SPARE_PART_UPDATED",
          entityType: "SparePart",
          entityId: updated.id,
          request,
          details: { fields: Object.keys(parsed.data).join(",") },
        }),
      });
      return updated;
    });
    return Response.json({ part });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return Response.json({ error: "Spare part was not found." }, { status: 404 });
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Spare-part update failed.", error);
    return Response.json({ error: "Spare part could not be updated." }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const user = await requirePermission("spareParts:write");
  if (user instanceof Response) return user;
  const id = await getId(context);
  if (id === null) return Response.json({ error: "Invalid spare-part ID." }, { status: 400 });
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = restockSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: "Enter a valid stock quantity and reason.", details: parsed.error.flatten().fieldErrors }, { status: 400 });

  try {
    const part = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`SELECT id FROM spare_parts WHERE id = ${id} FOR UPDATE`);
      const current = await transaction.sparePart.findUnique({ where: { id }, select: { quantity: true, stockCounted: true } });
      if (!current) throw new Error("SPARE_PART_NOT_FOUND");
      if (!current.stockCounted) throw new Error("STOCK_NOT_COUNTED");
      if (current.quantity > 2_147_483_647 - parsed.data.quantity) throw new Error("STOCK_LIMIT_EXCEEDED");
      const updated = await transaction.sparePart.update({
        where: { id },
        data: { quantity: { increment: parsed.data.quantity } },
      });
      await transaction.inventoryTransaction.create({
        data: {
          partId: id,
          quantity: parsed.data.quantity,
          transactionType: "IN",
          note: parsed.data.note?.trim() || "Admin stock replenishment",
          createdByUserId: user.id,
        },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "STOCK_RECEIVED",
          entityType: "SparePart",
          entityId: id,
          request,
          details: { quantity: parsed.data.quantity, note: parsed.data.note?.trim() || "Admin stock replenishment" },
        }),
      });
      return updated;
    });
    return Response.json({ part });
  } catch (error) {
    if (error instanceof Error && error.message === "SPARE_PART_NOT_FOUND") return Response.json({ error: "Spare part was not found." }, { status: 404 });
    if (error instanceof Error && error.message === "STOCK_NOT_COUNTED") return Response.json({ error: "Record a physical count before replenishing this part." }, { status: 409 });
    if (error instanceof Error && error.message === "STOCK_LIMIT_EXCEEDED") return Response.json({ error: "The resulting stock quantity would exceed the supported limit." }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return Response.json({ error: "Spare part was not found." }, { status: 404 });
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Spare-part restock failed.", error);
    return Response.json({ error: "Stock could not be replenished." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await requirePermission("spareParts:delete");
  if (user instanceof Response) return user;
  const id = await getId(context);
  if (id === null) return Response.json({ error: "Invalid spare-part ID." }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const part = await transaction.sparePart.findUnique({
        where: { id },
        select: {
          quantity: true,
          _count: { select: { transactions: true, jobCards: true, quotations: true } },
        },
      });
      if (!part) throw new Error("SPARE_PART_NOT_FOUND");
      if (part.quantity > 0) throw new Error("SPARE_PART_HAS_STOCK");
      if (part._count.transactions > 0 || part._count.jobCards > 0 || part._count.quotations > 0) throw new Error("SPARE_PART_HAS_HISTORY");

      await transaction.sparePart.delete({ where: { id } });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "SPARE_PART_DELETED",
          entityType: "SparePart",
          entityId: id,
          request,
        }),
      });
      return true;
    });
    return Response.json({ success: result });
  } catch (error) {
    if (error instanceof Error && error.message === "SPARE_PART_NOT_FOUND") return Response.json({ error: "Spare part was not found." }, { status: 404 });
    if (error instanceof Error && error.message === "SPARE_PART_HAS_STOCK") return Response.json({ error: "A spare part with stock on hand cannot be deleted." }, { status: 409 });
    if (error instanceof Error && error.message === "SPARE_PART_HAS_HISTORY") return Response.json({ error: "A spare part with inventory, job, or quotation history cannot be deleted." }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return Response.json({ error: "Spare part was not found." }, { status: 404 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return Response.json({ error: "A spare part with inventory, job, or quotation history cannot be deleted." }, { status: 409 });
    }
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Spare-part deletion failed.", error);
    return Response.json({ error: "Spare part could not be deleted." }, { status: 500 });
  }
}
