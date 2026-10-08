import { timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatReceiptNumber } from "@/lib/receipt";

export const runtime = "nodejs";

type CallbackItem = { Name?: string; Value?: string | number };
type StkCallback = {
  CheckoutRequestID?: string;
  ResultCode?: number;
  CallbackMetadata?: { Item?: CallbackItem[] };
};

function constantTimeMatch(actual: string | null, expected: string | undefined) {
  if (!actual || !expected) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function getValue(items: CallbackItem[], name: string) {
  return items.find((item) => item.Name === name)?.Value;
}

export async function POST(request: Request) {
  const callbackToken = process.env.MPESA_CALLBACK_TOKEN;
  if (!constantTimeMatch(new URL(request.url).searchParams.get("token"), callbackToken)) {
    return Response.json({ error: "Invalid callback authorization." }, { status: 401 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid callback body." }, { status: 400 });
  }

  const callback = (input as { Body?: { stkCallback?: StkCallback } } | null)?.Body?.stkCallback;
  if (!callback || typeof callback.CheckoutRequestID !== "string" || typeof callback.ResultCode !== "number") {
    return Response.json({ error: "Invalid STK callback." }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (transaction) => {
      const payment = await transaction.payment.findUnique({
        where: { mpesaCheckoutRequestId: callback.CheckoutRequestID },
        select: { id: true, invoiceId: true, amount: true, mpesaPhone: true },
      });
      if (!payment) throw new Error("MPESA_PAYMENT_NOT_FOUND");
      await transaction.$queryRaw(Prisma.sql`SELECT id FROM invoices WHERE id = ${payment.invoiceId} FOR UPDATE`);
      const currentPayment = await transaction.payment.findUnique({
        where: { id: payment.id },
        select: { status: true },
      });
      if (!currentPayment) throw new Error("MPESA_PAYMENT_NOT_FOUND");
      if (currentPayment.status !== "PENDING") return;
      const invoice = await transaction.invoice.findUnique({
        where: { id: payment.invoiceId },
        include: { payments: { where: { status: "PAID" }, select: { amount: true } } },
      });
      if (!invoice) throw new Error("MPESA_INVOICE_NOT_FOUND");

      if (callback.ResultCode !== 0) {
        await transaction.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
        await transaction.auditLog.create({
          data: buildAuditLogData({
            actorUserId: null,
            action: "MPESA_PAYMENT_FAILED",
            entityType: "Payment",
            entityId: payment.id,
            request,
            details: { resultCode: callback.ResultCode },
          }),
        });
        return;
      }

      const items = callback.CallbackMetadata?.Item ?? [];
      const amount = getValue(items, "Amount");
      const receipt = getValue(items, "MpesaReceiptNumber");
      const phone = getValue(items, "PhoneNumber");
      const transactionDate = getValue(items, "TransactionDate");
      const expectedAmount = new Prisma.Decimal(payment.amount);
      const alreadyPaid = invoice.payments.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
      const outstanding = new Prisma.Decimal(invoice.totalAmount).minus(alreadyPaid);
      const actualAmount = typeof amount === "number" || typeof amount === "string"
        ? new Prisma.Decimal(amount)
        : new Prisma.Decimal(-1);
      if (
        typeof receipt !== "string" ||
        typeof phone !== "number" && typeof phone !== "string" ||
        typeof transactionDate !== "number" && typeof transactionDate !== "string" ||
        !actualAmount.equals(expectedAmount) ||
        expectedAmount.greaterThan(outstanding) ||
        String(phone) !== payment.mpesaPhone
      ) {
        await transaction.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
        console.error("M-Pesa callback metadata did not match the pending payment.", { paymentId: payment.id });
        await transaction.auditLog.create({
          data: buildAuditLogData({
            actorUserId: null,
            action: "MPESA_CALLBACK_REJECTED",
            entityType: "Payment",
            entityId: payment.id,
            request,
            details: { resultCode: callback.ResultCode, reason: "metadata_mismatch" },
          }),
        });
        return;
      }

      const dateText = String(transactionDate);
      const paymentDate = /^\d{14}$/.test(dateText)
        ? new Date(`${dateText.slice(0, 4)}-${dateText.slice(4, 6)}-${dateText.slice(6, 8)}T${dateText.slice(8, 10)}:${dateText.slice(10, 12)}:${dateText.slice(12, 14)}+03:00`)
        : new Date();

      await transaction.payment.update({
        where: { id: payment.id },
        data: { status: "PAID", transactionReference: receipt, paymentDate },
      });
      await transaction.paymentReceipt.create({
        data: {
          paymentId: payment.id,
          receiptNumber: formatReceiptNumber(payment.id),
          issuedAt: paymentDate,
        },
      });
      const paid = alreadyPaid.plus(expectedAmount);
      if (paid.greaterThanOrEqualTo(invoice.totalAmount)) {
        await transaction.invoice.update({ where: { id: invoice.id }, data: { status: "PAID" } });
      }
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: null,
          action: "MPESA_PAYMENT_CONFIRMED",
          entityType: "Payment",
          entityId: payment.id,
          request,
          details: { invoiceId: invoice.id, amount: expectedAmount.toFixed(2) },
        }),
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    if (error instanceof Error && error.message === "MPESA_PAYMENT_NOT_FOUND") {
      console.error("Received an M-Pesa callback for an unknown checkout request.");
      return Response.json({ ResultCode: 1, ResultDesc: "Unknown checkout request" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "MPESA_INVOICE_NOT_FOUND") {
      console.error("Received an M-Pesa callback for an invoice that no longer exists.");
      return Response.json({ ResultCode: 1, ResultDesc: "Invoice not found" }, { status: 404 });
    }
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("M-Pesa callback processing failed.", error);
    return Response.json({ error: "The callback could not be processed." }, { status: 500 });
  }
}
