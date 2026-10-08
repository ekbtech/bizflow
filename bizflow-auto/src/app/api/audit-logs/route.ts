import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requirePermission("audit:read");
  if (user instanceof Response) return user;

  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") ?? 100);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 250) {
    return Response.json({ error: "Limit must be an integer between 1 and 250." }, { status: 400 });
  }

  try {
    const auditLogs = await prisma.auditLog.findMany({
      take: requestedLimit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        ipAddress: true,
        details: true,
        createdAt: true,
        actor: { select: { id: true, name: true, email: true } },
      },
    });
    return Response.json({ auditLogs }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Audit-log query failed.", error);
    return Response.json({ error: "Audit logs could not be loaded." }, { status: 500 });
  }
}
