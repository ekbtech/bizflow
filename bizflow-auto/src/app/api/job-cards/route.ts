import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const user = await requirePermission("jobCards:manage");
  if (user instanceof Response) return user;

  try {
    const jobs = await prisma.jobCard.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
      include: {
        mechanic: { select: { id: true, name: true } },
        qualityCheckedBy: { select: { name: true } },
        appointment: {
          include: {
            customer: { select: { name: true, phone: true, email: true } },
            vehicle: { select: { registrationNumber: true, make: true, model: true, year: true } },
            service: { select: { name: true } },
            reception: { select: { mileage: true, complaint: true } },
          },
        },
        quotation: {
          include: {
            items: { orderBy: { id: "asc" } },
          },
        },
        parts: { include: { part: { select: { name: true, partNumber: true } } } },
        invoice: { select: { id: true, status: true, totalAmount: true } },
      },
    });
    return Response.json({ jobs });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Job-card board query failed.", error);
    return Response.json({ error: "Job cards could not be loaded." }, { status: 500 });
  }
}
