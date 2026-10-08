import { isDatabaseUnavailable, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "CUSTOMER") return Response.json({ error: "Customer access required." }, { status: 403 });

  try {
    const expiredQuotations = await prisma.quotation.findMany({
      where: {
        status: "SENT",
        expiresAt: { lte: new Date() },
        appointment: { customer: { userId: user.id } },
      },
      select: { appointmentId: true },
    });
    await prisma.quotation.updateMany({
      where: {
        status: "SENT",
        expiresAt: { lte: new Date() },
        appointment: { customer: { userId: user.id } },
      },
      data: { status: "EXPIRED", approvalTokenHash: null },
    });
    const expiredAppointmentIds = [...new Set(expiredQuotations.map((quote) => quote.appointmentId))];
    if (expiredAppointmentIds.length) {
      await prisma.jobCard.updateMany({
        where: { appointmentId: { in: expiredAppointmentIds }, status: "AWAITING_APPROVAL" },
        data: { status: "DIAGNOSIS" },
      });
    }
    const quotations = await prisma.quotation.findMany({
      where: { appointment: { customer: { userId: user.id } } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        items: { orderBy: { id: "asc" } },
        appointment: {
          include: {
            vehicle: { select: { registrationNumber: true, make: true, model: true } },
            service: { select: { name: true } },
          },
        },
      },
    });
    return Response.json({ quotations }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Customer quotation list query failed.", error);
    return Response.json({ error: "Quotations could not be loaded." }, { status: 500 });
  }
}
