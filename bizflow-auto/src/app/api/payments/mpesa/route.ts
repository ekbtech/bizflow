import { Prisma } from "@prisma/client";
import { buildAuditLogData } from "@/lib/audit";
import { getSessionUser, isDatabaseUnavailable } from "@/lib/auth";
import { getMpesaAccessToken, getMpesaConfig, getMpesaTimestamp, normalizeMpesaPhone } from "@/lib/mpesa";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "CUSTOMER") return Response.json({ error: "Only customers can start a payment for their own invoice." }, { status: 403 });

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!input || typeof input !== "object" || !("invoiceId" in input) || !("phone" in input)) {
    return Response.json({ error: "Invoice ID and M-Pesa phone number are required." }, { status: 400 });
  }
  const raw = input as { invoiceId?: unknown; phone?: unknown };
  if (!Number.isSafeInteger(raw.invoiceId) || Number(raw.invoiceId) < 1 || typeof raw.phone !== "string") {
    return Response.json({ error: "Invalid invoice ID or phone number." }, { status: 400 });
  }
  const phone = normalizeMpesaPhone(raw.phone);
  if (!phone) return Response.json({ error: "Enter a valid Kenyan mobile number, such as 0712345678." }, { status: 400 });

  let config: ReturnType<typeof getMpesaConfig>;
  try {
    config = getMpesaConfig();
  } catch (error) {
    if (error instanceof Error && error.message === "MPESA_CONFIGURATION_MISSING") {
      return Response.json({ error: "M-Pesa sandbox is not configured on the server. Ask the administrator to add Daraja sandbox credentials." }, { status: 503 });
    }
    if (error instanceof Error && error.message === "MPESA_SANDBOX_ONLY") {
      return Response.json({ error: "Only the Safaricom Daraja sandbox is enabled in this setup." }, { status: 503 });
    }
    if (error instanceof Error && error.message === "MPESA_CALLBACK_REQUIRES_HTTPS") {
      return Response.json({ error: "The M-Pesa callback must use a public HTTPS URL before payments can be started." }, { status: 503 });
    }
    if (error instanceof Error && error.message === "MPESA_CALLBACK_INVALID") {
      return Response.json({ error: "The configured M-Pesa callback URL is invalid." }, { status: 503 });
    }
    throw error;
  }

  let paymentId: number | null = null;
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: Number(raw.invoiceId), customer: { userId: user.id } },
      include: { payments: { where: { status: "PAID" }, select: { amount: true } } },
    });
    if (!invoice) return Response.json({ error: "Invoice was not found for this customer account." }, { status: 404 });

    const paid = invoice.payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
    const balance = new Prisma.Decimal(invoice.totalAmount).minus(paid);
    if (balance.lessThanOrEqualTo(0)) return Response.json({ error: "This invoice is already fully paid." }, { status: 409 });
    if (!balance.isInteger() || balance.greaterThan(250_000)) {
      return Response.json({ error: "The outstanding balance must be a whole shilling amount not greater than KSh 250,000 for an M-Pesa STK payment." }, { status: 400 });
    }

    const payment = await prisma.$transaction(async (transaction) => {
      const created = await transaction.payment.create({
        data: { invoiceId: invoice.id, amount: balance, paymentMethod: "M_PESA", status: "PENDING", mpesaPhone: phone },
        select: { id: true },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "MPESA_PAYMENT_REQUESTED",
          entityType: "Payment",
          entityId: created.id,
          request,
          details: { invoiceId: invoice.id, amount: balance.toFixed(2) },
        }),
      });
      return created;
    });
    paymentId = payment.id;

    const accessToken = await getMpesaAccessToken(config);
    const timestamp = getMpesaTimestamp();
    const password = Buffer.from(`${config.shortcode}${config.passkey}${timestamp}`).toString("base64");
    const callbackUrl = new URL(config.callbackUrl);
    const transactionType = process.env.MPESA_TRANSACTION_TYPE === "CustomerBuyGoodsOnline"
      ? "CustomerBuyGoodsOnline"
      : "CustomerPayBillOnline";
    const response = await fetch(`${config.baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        BusinessShortCode: config.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: transactionType,
        Amount: Number(balance.toFixed(0)),
        PartyA: phone,
        PartyB: config.shortcode,
        PhoneNumber: phone,
        CallBackURL: callbackUrl.toString(),
        AccountReference: `INV-${invoice.id}`,
        TransactionDesc: `BizFlow Auto invoice ${invoice.id}`,
      }),
    });
    const result: { ResponseCode?: string; CheckoutRequestID?: string; errorMessage?: string } = await response.json();
    if (!response.ok || result.ResponseCode !== "0" || !result.CheckoutRequestID) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
      console.error("Safaricom Daraja sandbox rejected STK request.", { status: response.status });
      return Response.json({ error: "Safaricom could not start the M-Pesa payment prompt. Verify the sandbox credentials and try again." }, { status: 502 });
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.payment.update({
        where: { id: payment.id },
        data: { mpesaCheckoutRequestId: result.CheckoutRequestID },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "MPESA_STK_PROMPT_SENT",
          entityType: "Payment",
          entityId: payment.id,
          request,
        }),
      });
    });
    return Response.json({ status: "PENDING", message: "Check your phone and enter your M-Pesa PIN to complete the sandbox payment." }, { status: 202 });
  } catch (error) {
    if (paymentId !== null) {
      await prisma.payment.updateMany({ where: { id: paymentId, status: "PENDING" }, data: { status: "FAILED" } }).catch((updateError: unknown) => {
        console.error("Failed to mark rejected M-Pesa attempt.", updateError);
      });
    }
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("M-Pesa sandbox request failed.", error);
    return Response.json({ error: "M-Pesa sandbox payment could not be started. Check server connectivity and Daraja configuration." }, { status: 502 });
  }
}
