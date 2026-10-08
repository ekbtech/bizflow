import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const mechanicSchema = z.object({
  phone: z.string().trim().min(5).max(50).nullable().optional(),
  specialization: z.string().trim().min(2).max(255).nullable().optional(),
  status: z.enum(["Available", "Busy", "On leave"]).optional(),
}).refine((data) => Object.keys(data).length > 0, "At least one field is required.");

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const user = await requirePermission("mechanics:write");
  if (user instanceof Response) return user;
  const { id: rawId } = await context.params;
  if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) {
    return Response.json({ error: "Invalid mechanic ID." }, { status: 400 });
  }
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = mechanicSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: "Invalid mechanic details.", details: parsed.error.flatten().fieldErrors }, { status: 400 });

  try {
    const mechanic = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.mechanic.update({
        where: { id: Number(rawId) },
        data: {
          ...parsed.data,
          ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone || null } : {}),
          ...(parsed.data.specialization !== undefined ? { specialization: parsed.data.specialization || null } : {}),
        },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "MECHANIC_UPDATED",
          entityType: "Mechanic",
          entityId: updated.id,
          request,
          details: { fields: Object.keys(parsed.data).join(",") },
        }),
      });
      return updated;
    });
    return Response.json({ mechanic });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return Response.json({ error: "Mechanic was not found." }, { status: 404 });
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Mechanic update failed.", error);
    return Response.json({ error: "Mechanic could not be updated." }, { status: 500 });
  }
}
