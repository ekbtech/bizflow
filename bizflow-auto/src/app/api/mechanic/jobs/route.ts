import { getSessionUser, isDatabaseUnavailable } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "MECHANIC") {
    return Response.json({ error: "Mechanic access required." }, { status: 403 });
  }

  try {
    const mechanic = await prisma.mechanic.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!mechanic) return Response.json({ error: "Mechanic profile was not found." }, { status: 404 });

    const jobs = await prisma.jobCard.findMany({
      where: { mechanicId: mechanic.id },
      orderBy: { createdAt: "desc" },
      include: {
        appointment: {
          include: {
            customer: { select: { name: true, phone: true } },
            vehicle: { select: { registrationNumber: true, make: true, model: true, year: true, mileage: true } },
            service: { select: { name: true } },
          },
        },
        parts: {
          include: { part: { select: { name: true, partNumber: true, unitPrice: true } } },
        },
        quotation: {
          select: {
            status: true,
            totalAmount: true,
            items: {
              where: { itemType: "PART" },
              select: { partId: true, description: true, quantity: true, unitPrice: true },
              orderBy: { id: "asc" },
            },
          },
        },
      },
    });
    return Response.json({ jobs });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable." }, { status: 503 });
    }
    console.error("Mechanic job list query failed.", error);
    return Response.json({ error: "Assigned jobs could not be loaded." }, { status: 500 });
  }
}
