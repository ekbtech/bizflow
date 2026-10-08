import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const movementSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ISSUE"),
    partId: z.number().int().positive(),
    quantity: z.number().int().positive().max(1_000_000),
    note: z.string().trim().min(2).max(500),
  }),
  z.object({
    action: z.literal("ADJUST"),
    partId: z.number().int().positive(),
    newQuantity: z.number().int().min(0).max(1_000_000),
    note: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal("TRANSFER"),
    partId: z.number().int().positive(),
    quantity: z.number().int().positive().max(1_000_000),
    fromLocation: z.string().trim().min(2).max(120),
    toLocation: z.string().trim().min(2).max(120),
    note: z.string().trim().max(500).optional(),
  }).refine((value) => value.fromLocation.toLowerCase() !== value.toLocation.toLowerCase(), {
    message: "Choose different source and destination locations.",
    path: ["toLocation"],
  }),
]);

export async function GET(request: Request) {
  const user = await requirePermission("spareParts:read");
  if (user instanceof Response) return user;
  const partIdText = new URL(request.url).searchParams.get("partId");
  let partId: number | undefined;
  if (partIdText !== null) {
    if (!/^[1-9]\d*$/.test(partIdText) || !Number.isSafeInteger(Number(partIdText))) {
      return Response.json({ error: "Invalid spare-part ID." }, { status: 400 });
    }
    partId = Number(partIdText);
  }
  try {
    const transactions = await prisma.inventoryTransaction.findMany({
      where: partId ? { partId } : undefined,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 250,
      include: {
        part: { select: { name: true, partNumber: true } },
        supplier: { select: { name: true } },
        purchaseOrder: { select: { id: true } },
        createdBy: { select: { name: true } },
      },
    });
    return Response.json({ transactions }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Inventory transaction query failed.", error);
    return Response.json({ error: "Inventory transactions could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requirePermission("spareParts:write");
  if (user instanceof Response) return user;
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = movementSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Invalid inventory movement.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const transactionRecord = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`SELECT id FROM spare_parts WHERE id = ${parsed.data.partId} FOR UPDATE`);
      const part = await transaction.sparePart.findUnique({
        where: { id: parsed.data.partId },
        select: { id: true, quantity: true, stockCounted: true },
      });
      if (!part) throw new Error("PART_NOT_FOUND");

      let transactionType: "OUT" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "TRANSFER";
      let quantity: number;
      let note: string;
      let fromLocation: string | null = null;
      let toLocation: string | null = null;
      let auditAction: string;
      let auditDetails: Prisma.InputJsonValue;
      if (parsed.data.action === "ISSUE") {
        if (!part.stockCounted) throw new Error("STOCK_NOT_COUNTED");
        if (parsed.data.quantity > part.quantity) throw new Error("INSUFFICIENT_STOCK");
        await transaction.sparePart.update({
          where: { id: part.id },
          data: { quantity: { decrement: parsed.data.quantity } },
        });
        transactionType = "OUT";
        quantity = parsed.data.quantity;
        note = parsed.data.note;
        auditAction = "STOCK_ISSUED";
        auditDetails = { quantity, note };
      } else if (parsed.data.action === "ADJUST") {
        const difference = parsed.data.newQuantity - part.quantity;
        if (difference === 0 && part.stockCounted) throw new Error("NO_STOCK_CHANGE");
        await transaction.sparePart.update({
          where: { id: part.id },
          data: { quantity: parsed.data.newQuantity, stockCounted: true },
        });
        transactionType = difference >= 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT";
        quantity = Math.abs(difference);
        note = parsed.data.note || `Physical stock count set to ${parsed.data.newQuantity}`;
        auditAction = "STOCK_ADJUSTED";
        auditDetails = { previousQuantity: part.quantity, newQuantity: parsed.data.newQuantity, stockCounted: true, note };
      } else {
        if (!part.stockCounted) throw new Error("STOCK_NOT_COUNTED");
        transactionType = "TRANSFER";
        quantity = parsed.data.quantity;
        note = parsed.data.note?.trim() || "Stock moved between locations";
        fromLocation = parsed.data.fromLocation;
        toLocation = parsed.data.toLocation;
        auditAction = "STOCK_TRANSFER_RECORDED";
        auditDetails = { quantity, fromLocation, toLocation, note, balanceUnchanged: true };
      }

      const created = await transaction.inventoryTransaction.create({
        data: {
          partId: part.id,
          quantity,
          transactionType,
          note,
          fromLocation,
          toLocation,
          createdByUserId: user.id,
        },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: auditAction,
          entityType: "InventoryTransaction",
          entityId: created.id,
          request,
          details: { partId: part.id, ...auditDetails },
        }),
      });
      return created;
    });
    return Response.json({ transaction: transactionRecord }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PART_NOT_FOUND") return Response.json({ error: "Spare part was not found." }, { status: 404 });
      if (error.message === "STOCK_NOT_COUNTED") return Response.json({ error: "Record a physical stock count before issuing or transferring this part." }, { status: 409 });
      if (error.message === "INSUFFICIENT_STOCK") return Response.json({ error: "The requested issue exceeds available stock." }, { status: 409 });
      if (error.message === "NO_STOCK_CHANGE") return Response.json({ error: "The counted quantity matches the current stock; no adjustment was recorded." }, { status: 409 });
    }
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Inventory movement failed.", error);
    return Response.json({ error: "Inventory movement could not be recorded." }, { status: 500 });
  }
}
