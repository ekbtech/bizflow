import { buildAuditLogData } from "@/lib/audit";
import { clearSession, getSessionUser, isDatabaseUnavailable } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (user) {
      await prisma.$transaction(async (transaction) => {
        await transaction.user.update({
          where: { id: user.id },
          data: { sessionVersion: { increment: 1 } },
        });
        await transaction.auditLog.create({
          data: buildAuditLogData({
            actorUserId: user.id,
            action: "LOGOUT",
            entityType: "User",
            entityId: user.id,
            request,
          }),
        });
      });
    }
    await clearSession();
    return Response.json({ success: true });
  } catch (error) {
    await clearSession();
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Logout could not revoke the session.", error);
    return Response.json({ error: "Logout could not be completed." }, { status: 500 });
  }
}
