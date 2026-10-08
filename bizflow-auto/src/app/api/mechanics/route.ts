import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const user = await requirePermission("mechanics:read");
  if (user instanceof Response) return user;

  try {
    const mechanics = await prisma.mechanic.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { jobCards: true } } },
    });
    return Response.json({ mechanics });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable." }, { status: 503 });
    }
    console.error("Mechanic list query failed.", error);
    return Response.json({ error: "Mechanics could not be loaded." }, { status: 500 });
  }
}
