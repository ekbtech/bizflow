import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const user = await requirePermission("invoices:read");
  if (user instanceof Response) return user;

  try {
    const invoices = await prisma.invoice.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        vehicle: { select: { registrationNumber: true, make: true, model: true } },
        items: { select: { itemType: true, itemName: true, quantity: true, unitPrice: true, discountAmount: true, lineTotal: true } },
        payments: { select: { amount: true, status: true } },
      },
    });
    return Response.json({ invoices });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Invoice list query failed.", error);
    return Response.json({ error: "Invoices could not be loaded." }, { status: 500 });
  }
}
