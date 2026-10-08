import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const supplierSchema = z.object({
  name: z.string().trim().min(2).max(255),
  contactPerson: z.string().trim().max(255).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  email: z.union([z.string().trim().email().max(255), z.literal("")]).nullable().optional(),
  address: z.string().trim().max(5000).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

export async function GET() {
  const user = await requirePermission("spareParts:read");
  if (user instanceof Response) return user;

  try {
    const suppliers = await prisma.supplier.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      take: 500,
      select: { id: true, name: true, contactPerson: true, phone: true, email: true, address: true, notes: true, isActive: true },
    });
    return Response.json({ suppliers }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Supplier list query failed.", error);
    return Response.json({ error: "Suppliers could not be loaded." }, { status: 500 });
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
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Invalid supplier details.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const supplier = await prisma.$transaction(async (transaction) => {
      const created = await transaction.supplier.create({
        data: {
          ...parsed.data,
          email: parsed.data.email || null,
          contactPerson: parsed.data.contactPerson || null,
          phone: parsed.data.phone || null,
          address: parsed.data.address || null,
          notes: parsed.data.notes || null,
        },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "SUPPLIER_CREATED",
          entityType: "Supplier",
          entityId: created.id,
          request,
        }),
      });
      return created;
    });
    return Response.json({ supplier }, { status: 201 });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Supplier creation failed.", error);
    return Response.json({ error: "Supplier could not be created." }, { status: 500 });
  }
}
