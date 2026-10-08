import { getSessionUser, isDatabaseUnavailable } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "CUSTOMER") {
    return Response.json({ error: "You do not have permission to view customer invoices." }, { status: 403 });
  }

  try {
    const invoices = await prisma.invoice.findMany({
      where: { customer: { userId: user.id } },
      orderBy: { createdAt: "desc" },
      include: {
        vehicle: { select: { registrationNumber: true, make: true, model: true } },
        items: { select: { itemType: true, itemName: true, quantity: true, unitPrice: true, discountAmount: true, lineTotal: true } },
        payments: {
          select: {
            amount: true,
            paymentMethod: true,
            paymentDate: true,
            status: true,
            receipt: { select: { id: true, receiptNumber: true } },
          },
        },
      },
    });
    return Response.json({ invoices });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable." }, { status: 503 });
    }
    console.error("Customer invoice list query failed.", error);
    return Response.json({ error: "Invoices could not be loaded." }, { status: 500 });
  }
}
