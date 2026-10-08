import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const preferenceSchema = z.object({ whatsappOptIn: z.boolean() });

export async function PATCH(request: Request) {
  const user = await requireRole("CUSTOMER");
  if (user instanceof Response) return user;

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = preferenceSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: "Invalid WhatsApp preference." }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const customer = await transaction.customer.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!customer) return false;
      await transaction.customer.update({
        where: { id: customer.id },
        data: { whatsappOptIn: parsed.data.whatsappOptIn },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "CUSTOMER_COMMUNICATION_PREFERENCE_UPDATED",
          entityType: "Customer",
          entityId: customer.id,
          request,
          details: { whatsappOptIn: parsed.data.whatsappOptIn },
        }),
      });
      return true;
    });
    if (!result) return Response.json({ error: "Customer profile was not found." }, { status: 404 });
    return Response.json({ whatsappOptIn: parsed.data.whatsappOptIn });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Customer WhatsApp preference update failed.", error);
    return Response.json({ error: "WhatsApp preference could not be saved." }, { status: 500 });
  }
}
