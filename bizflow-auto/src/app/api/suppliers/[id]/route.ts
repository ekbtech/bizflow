import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const supplierUpdateSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  contactPerson: z.string().trim().max(255).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  email: z.union([z.string().trim().email().max(255), z.literal("")]).nullable().optional(),
  address: z.string().trim().max(5000).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  isActive: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one supplier field is required.");

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const user = await requirePermission("spareParts:write");
  if (user instanceof Response) return user;
  const { id: rawId } = await context.params;
  if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) {
    return Response.json({ error: "Invalid supplier ID." }, { status: 400 });
  }
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = supplierUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Invalid supplier update.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const supplier = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.supplier.update({
        where: { id: Number(rawId) },
        data: {
          ...parsed.data,
          ...(parsed.data.email !== undefined ? { email: parsed.data.email || null } : {}),
          ...(parsed.data.contactPerson !== undefined ? { contactPerson: parsed.data.contactPerson || null } : {}),
          ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone || null } : {}),
          ...(parsed.data.address !== undefined ? { address: parsed.data.address || null } : {}),
          ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes || null } : {}),
        },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "SUPPLIER_UPDATED",
          entityType: "Supplier",
          entityId: updated.id,
          request,
          details: { fields: Object.keys(parsed.data).join(",") },
        }),
      });
      return updated;
    });
    return Response.json({ supplier });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2025") {
      return Response.json({ error: "Supplier was not found." }, { status: 404 });
    }
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Supplier update failed.", error);
    return Response.json({ error: "Supplier could not be updated." }, { status: 500 });
  }
}
