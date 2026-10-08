import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { DEFAULT_REORDER_LEVEL } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const partSchema = z.object({
  name: z.string().trim().min(2).max(255),
  partNumber: z.string().trim().max(100).optional(),
  quantity: z.number().int().min(0).max(1_000_000),
  unitPrice: z.number().positive().max(10_000_000),
  reorderLevel: z.number().int().min(0).max(1_000_000).default(DEFAULT_REORDER_LEVEL),
  category: z.string().trim().min(2).max(100).optional(),
  vehicleType: z.enum(["CAR", "BICYCLE", "MOTORBIKE", "UNIVERSAL"]).optional(),
});

export async function GET() {
  const user = await requirePermission("spareParts:read");
  if (user instanceof Response) return user;

  try {
    const parts = await prisma.sparePart.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, partNumber: true, quantity: true, stockCounted: true,
        unitPrice: true, priceConfigured: true, category: true, vehicleType: true, reorderLevel: true,
      },
    });
    return Response.json({ parts }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable." }, { status: 503 });
    }
    console.error("Spare-part list query failed.", error);
    return Response.json({ error: "Spare parts could not be loaded." }, { status: 500 });
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

  const parsed = partSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid spare-part details.", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const part = await prisma.$transaction(async (transaction) => {
      const created = await transaction.sparePart.create({
        data: {
          ...parsed.data,
          partNumber: parsed.data.partNumber || null,
          category: parsed.data.category ?? "General",
          vehicleType: parsed.data.vehicleType ?? "UNIVERSAL",
          stockCounted: true,
          priceConfigured: true,
        },
      });
      if (created.quantity > 0) {
        await transaction.inventoryTransaction.create({
          data: {
            partId: created.id,
            quantity: created.quantity,
            transactionType: "IN",
            note: "Initial stock",
            createdByUserId: user.id,
          },
        });
      }
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "SPARE_PART_CREATED",
          entityType: "SparePart",
          entityId: created.id,
          request,
          details: { initialQuantity: created.quantity },
        }),
      });
      return created;
    });
    return Response.json({ part }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "A part with that identifier already exists." }, { status: 409 });
    }
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable." }, { status: 503 });
    }
    console.error("Spare-part creation failed.", error);
    return Response.json({ error: "Spare part could not be added." }, { status: 500 });
  }
}
