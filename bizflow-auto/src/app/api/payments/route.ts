import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatReceiptNumber } from "@/lib/receipt";

export const runtime = "nodejs";

const paymentSchema = z.object({
  invoiceId: z.number().int().positive(),
  amount: z.number().positive().max(100_000_000),
  paymentMethod: z.enum(["CASH", "M_PESA", "CARD", "BANK"]),
  transactionReference: z.string().trim().max(255).optional(),
});

export async function GET() {
  const user = await requirePermission("payments:read");
  if (user instanceof Response) return user;

  try {
    const payments = await prisma.payment.findMany({
      orderBy: { paymentDate: "desc" },
      include: {
        invoice: { select: { id: true, totalAmount: true, customer: { select: { name: true } } } },
        receipt: { select: { id: true, receiptNumber: true, issuedAt: true } },
      },
    });
    return Response.json({ payments });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Payment list query failed.", error);
    return Response.json({ error: "Payments could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requirePermission("payments:write");
  if (user instanceof Response) return user;

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Invalid payment details.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const payment = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`SELECT id FROM invoices WHERE id = ${parsed.data.invoiceId} FOR UPDATE`);
      const invoice = await transaction.invoice.findUnique({
        where: { id: parsed.data.invoiceId },
        include: { payments: { where: { status: "PAID" }, select: { amount: true } } },
      });
      if (!invoice) throw new Error("INVOICE_NOT_FOUND");

      const alreadyPaid = invoice.payments.reduce(
        (sum, item) => sum.plus(item.amount),
        new Prisma.Decimal(0),
      );
      const outstanding = new Prisma.Decimal(invoice.totalAmount).minus(alreadyPaid);
      const amount = new Prisma.Decimal(parsed.data.amount.toFixed(2));
      if (amount.greaterThan(outstanding)) throw new Error("PAYMENT_EXCEEDS_BALANCE");

      const created = await transaction.payment.create({
        data: {
          invoiceId: invoice.id,
          amount,
          paymentMethod: parsed.data.paymentMethod,
          transactionReference: parsed.data.transactionReference?.trim() || null,
          status: "PAID",
        },
      });
      const receipt = await transaction.paymentReceipt.create({
        data: {
          paymentId: created.id,
          receiptNumber: formatReceiptNumber(created.id),
          issuedByUserId: user.id,
        },
      });
      const newPaidTotal = alreadyPaid.plus(amount);
      if (newPaidTotal.greaterThanOrEqualTo(invoice.totalAmount)) {
        await transaction.invoice.update({ where: { id: invoice.id }, data: { status: "PAID" } });
      }
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "PAYMENT_RECORDED",
          entityType: "Payment",
          entityId: created.id,
          request,
          details: {
            invoiceId: invoice.id,
            amount: amount.toFixed(2),
            paymentMethod: parsed.data.paymentMethod,
          },
        }),
      });
      return { ...created, receipt };
    });

    return Response.json({ payment }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "INVOICE_NOT_FOUND") return Response.json({ error: "Invoice was not found." }, { status: 404 });
    if (error instanceof Error && error.message === "PAYMENT_EXCEEDS_BALANCE") return Response.json({ error: "The payment amount exceeds the invoice balance." }, { status: 409 });
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Payment recording failed.", error);
    return Response.json({ error: "Payment could not be recorded." }, { status: 500 });
  }
}
