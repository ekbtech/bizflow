import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const purchaseOrderSchema = z.object({
  supplierId: z.number().int().positive(),
  expectedAt: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  items: z.array(z.object({
    partId: z.number().int().positive(),
    quantity: z.number().int().positive().max(1_000_000),
    unitCost: z.number().positive().max(10_000_000),
  })).min(1).max(100),
}).refine((value) => new Set(value.items.map((item) => item.partId)).size === value.items.length, {
  message: "Each spare part may only appear once on a purchase order.",
  path: ["items"],
});

export async function GET() {
  const user = await requirePermission("spareParts:read");
  if (user instanceof Response) return user;
  try {
    const purchaseOrders = await prisma.purchaseOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        supplier: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
        items: {
          orderBy: { id: "asc" },
          include: { part: { select: { id: true, name: true, partNumber: true } } },
        },
      },
    });
    return Response.json({ purchaseOrders }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Purchase order list query failed.", error);
    return Response.json({ error: "Purchase orders could not be loaded." }, { status: 500 });
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
  const parsed = purchaseOrderSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Invalid purchase order.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const purchaseOrder = await prisma.$transaction(async (transaction) => {
      const supplier = await transaction.supplier.findUnique({
        where: { id: parsed.data.supplierId },
        select: { id: true, isActive: true },
      });
      if (!supplier) throw new Error("SUPPLIER_NOT_FOUND");
      if (!supplier.isActive) throw new Error("SUPPLIER_INACTIVE");
      const partIds = parsed.data.items.map((item) => item.partId);
      const parts = await transaction.sparePart.findMany({
        where: { id: { in: partIds } },
        select: { id: true },
      });
      if (parts.length !== partIds.length) throw new Error("PART_NOT_FOUND");

      const created = await transaction.purchaseOrder.create({
        data: {
          supplierId: supplier.id,
          createdByUserId: user.id,
          expectedAt: parsed.data.expectedAt ? new Date(parsed.data.expectedAt) : null,
          notes: parsed.data.notes?.trim() || null,
          items: { create: parsed.data.items },
        },
        include: {
          supplier: { select: { id: true, name: true } },
          items: { include: { part: { select: { id: true, name: true, partNumber: true } } } },
        },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "PURCHASE_ORDER_CREATED",
          entityType: "PurchaseOrder",
          entityId: created.id,
          request,
          details: { supplierId: supplier.id, itemCount: created.items.length },
        }),
      });
      return created;
    });
    return Response.json({ purchaseOrder }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "SUPPLIER_NOT_FOUND") return Response.json({ error: "Supplier was not found." }, { status: 404 });
    if (error instanceof Error && error.message === "SUPPLIER_INACTIVE") return Response.json({ error: "Purchase orders require an active supplier." }, { status: 409 });
    if (error instanceof Error && error.message === "PART_NOT_FOUND") return Response.json({ error: "One or more selected spare parts were not found." }, { status: 404 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return Response.json({ error: "A supplier or spare part was not found." }, { status: 404 });
    }
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Purchase order creation failed.", error);
    return Response.json({ error: "Purchase order could not be created." }, { status: 500 });
  }
}
