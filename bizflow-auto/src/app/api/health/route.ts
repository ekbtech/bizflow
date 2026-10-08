import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json(
      { status: "ok", checks: { database: "ok" } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Health check failed.", error);
    return Response.json(
      { status: "unavailable", checks: { database: "unavailable" } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
