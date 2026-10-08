import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const updateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ORDER") }),
  z.object({ action: z.literal("CANCEL") }),
  z.object({
    action: z.literal("RECEIVE"),
    items: z.array(z.object({
      itemId: z.number().int().positive(),
      quantity: z.number().int().positive().max(1_000_000),
    })).min(1).max(100).refine((items) => new Set(items.map((item) => item.itemId)).size === items.length, "Each purchase item may only appear once per receipt."),
    note: z.string().trim().max(500).optional(),
  }),
]);

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const user = await requirePermission("spareParts:write");
  if (user instanceof Response) return user;
  const { id: rawId } = await context.params;
  if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) {
    return Response.json({ error: "Invalid purchase order ID." }, { status: 400 });
  }
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Invalid purchase order update.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const purchaseOrder = await prisma.$transaction(async (transaction) => {
      const orderId = Number(rawId);
      await transaction.$queryRaw(Prisma.sql`SELECT id FROM purchase_orders WHERE id = ${orderId} FOR UPDATE`);
      const order = await transaction.purchaseOrder.findUnique({
        where: { id: orderId },
        include: { items: { select: { id: true, partId: true, quantity: true, receivedQuantity: true } } },
      });
      if (!order) throw new Error("PURCHASE_ORDER_NOT_FOUND");

      let action: string;
      let details: Prisma.InputJsonValue;
      if (parsed.data.action === "ORDER") {
        if (order.status !== "DRAFT") throw new Error("PURCHASE_ORDER_NOT_EDITABLE");
        const changed = await transaction.purchaseOrder.updateMany({
          where: { id: order.id, status: "DRAFT" },
          data: { status: "ORDERED" },
        });
        if (!changed.count) throw new Error("PURCHASE_ORDER_NOT_EDITABLE");
        action = "PURCHASE_ORDER_PLACED";
        details = { status: "ORDERED" };
      } else if (parsed.data.action === "CANCEL") {
        if (!["DRAFT", "ORDERED"].includes(order.status) || order.items.some((item) => item.receivedQuantity > 0)) {
          throw new Error("PURCHASE_ORDER_NOT_CANCELLABLE");
        }
        const changed = await transaction.purchaseOrder.updateMany({
          where: { id: order.id, status: { in: ["DRAFT", "ORDERED"] } },
          data: { status: "CANCELLED" },
        });
        if (!changed.count) throw new Error("PURCHASE_ORDER_NOT_CANCELLABLE");
        action = "PURCHASE_ORDER_CANCELLED";
        details = { status: "CANCELLED" };
      } else {
        if (!["ORDERED", "PARTIALLY_RECEIVED"].includes(order.status)) throw new Error("PURCHASE_ORDER_NOT_RECEIVABLE");
        const receiptLines = parsed.data.items.map((receipt) => {
          const item = order.items.find((candidate) => candidate.id === receipt.itemId);
          if (!item) throw new Error("PURCHASE_ITEM_NOT_FOUND");
          if (item.receivedQuantity + receipt.quantity > item.quantity) throw new Error("RECEIPT_EXCEEDS_ORDER");
          return { item, quantity: receipt.quantity };
        }).sort((left, right) => left.item.partId - right.item.partId);

        for (const { item, quantity } of receiptLines) {
          await transaction.$queryRaw(Prisma.sql`SELECT id FROM spare_parts WHERE id = ${item.partId} FOR UPDATE`);
          const changed = await transaction.sparePart.updateMany({
            where: { id: item.partId, quantity: { lte: 2_147_483_647 - quantity } },
            data: { quantity: { increment: quantity } },
          });
          if (!changed.count) throw new Error("PART_NOT_FOUND_OR_STOCK_LIMIT");
          await transaction.purchaseOrderItem.update({
            where: { id: item.id },
            data: { receivedQuantity: { increment: quantity } },
          });
          await transaction.inventoryTransaction.create({
            data: {
              partId: item.partId,
              quantity,
              transactionType: "IN",
              note: parsed.data.note?.trim() || `Received on purchase order PO-${String(order.id).padStart(6, "0")}`,
              supplierId: order.supplierId,
              purchaseOrderId: order.id,
              purchaseOrderItemId: item.id,
              createdByUserId: user.id,
            },
          });
        }

        const receivedByItem = new Map(receiptLines.map(({ item, quantity }) => [item.id, quantity]));
        const fullyReceived = order.items.every((item) => item.receivedQuantity + (receivedByItem.get(item.id) ?? 0) === item.quantity);
        await transaction.purchaseOrder.update({
          where: { id: order.id },
          data: { status: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED" },
        });
        action = "PURCHASE_ORDER_STOCK_RECEIVED";
        details = {
          status: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED",
          lines: receiptLines.map(({ item, quantity }) => ({ itemId: item.id, partId: item.partId, quantity })),
        };
      }

      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action,
          entityType: "PurchaseOrder",
          entityId: order.id,
          request,
          details,
        }),
      });
      return transaction.purchaseOrder.findUnique({
        where: { id: order.id },
        include: {
          supplier: { select: { id: true, name: true } },
          createdBy: { select: { name: true } },
          items: { orderBy: { id: "asc" }, include: { part: { select: { id: true, name: true, partNumber: true } } } },
        },
      });
    });
    if (!purchaseOrder) throw new Error("PURCHASE_ORDER_NOT_FOUND");
    return Response.json({ purchaseOrder });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PURCHASE_ORDER_NOT_FOUND") return Response.json({ error: "Purchase order was not found." }, { status: 404 });
      if (error.message === "PURCHASE_ITEM_NOT_FOUND") return Response.json({ error: "A purchase-order line was not found." }, { status: 404 });
      if (error.message === "PURCHASE_ORDER_NOT_EDITABLE") return Response.json({ error: "Only a draft purchase order can be placed." }, { status: 409 });
      if (error.message === "PURCHASE_ORDER_NOT_CANCELLABLE") return Response.json({ error: "This purchase order cannot be cancelled after stock has been received." }, { status: 409 });
      if (error.message === "PURCHASE_ORDER_NOT_RECEIVABLE") return Response.json({ error: "Only an ordered purchase order can receive stock." }, { status: 409 });
      if (error.message === "RECEIPT_EXCEEDS_ORDER") return Response.json({ error: "A receipt cannot exceed the unreceived quantity on its purchase order." }, { status: 409 });
      if (error.message === "PART_NOT_FOUND_OR_STOCK_LIMIT") return Response.json({ error: "A spare part was not found or its stock quantity would exceed the supported limit." }, { status: 409 });
    }
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Purchase order update failed.", error);
    return Response.json({ error: "Purchase order could not be updated." }, { status: 500 });
  }
}
