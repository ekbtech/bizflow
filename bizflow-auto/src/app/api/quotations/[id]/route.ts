import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { sendEmailNotification } from "@/lib/email";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateQuotation, quotationItemsSchema, quoteExpiry } from "@/lib/quotation";

export const runtime = "nodejs";

const updateSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("SAVE_DRAFT"),
    expiresAt: z.string().date(),
    notes: z.string().trim().max(5000).optional(),
    items: quotationItemsSchema,
  }),
  z.object({ action: z.literal("SEND") }),
]);

type RouteContext = { params: Promise<{ id: string }> };

function validAppUrl(request: Request) {
  const value = process.env.APP_URL?.trim() || (process.env.NODE_ENV === "development" ? new URL(request.url).origin : "");
  if (!value) return null;
  try {
    const url = new URL(value);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await requirePermission("quotations:write");
  if (user instanceof Response) return user;

  const { id: rawId } = await context.params;
  if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) {
    return Response.json({ error: "Invalid quotation ID." }, { status: 400 });
  }
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Invalid quotation update.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  if (parsed.data.action === "SAVE_DRAFT") {
    const draftData = parsed.data;
    const expiresAt = quoteExpiry(draftData.expiresAt);
    const now = new Date();
    if (expiresAt <= now || expiresAt.getTime() > now.getTime() + 90 * 24 * 60 * 60 * 1000) {
      return Response.json({ error: "Quotation expiry must be within the next 90 days." }, { status: 400 });
    }
    let amounts: ReturnType<typeof calculateQuotation>;
    try {
      amounts = calculateQuotation(draftData.items);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (["INVALID_QUOTATION_LINE", "QUOTATION_LINE_TOO_LARGE", "QUOTATION_TOTAL_TOO_LARGE"].includes(code)) {
        return Response.json({ error: "Quotation quantities, prices, discounts, or totals are invalid." }, { status: 400 });
      }
      console.error("Quotation amount calculation failed.", error);
      return Response.json({ error: "Quotation amounts could not be calculated." }, { status: 500 });
    }

    try {
      const quotation = await prisma.$transaction(async (transaction) => {
        const existing = await transaction.quotation.findUnique({
          where: { id: Number(rawId) },
          select: { id: true, status: true, appointmentId: true, appointment: { select: { status: true } } },
        });
        if (!existing) throw new Error("QUOTATION_NOT_FOUND");
        if (existing.status !== "DRAFT") throw new Error("QUOTATION_NOT_DRAFT");
        if (!["CHECKED_IN", "IN_SERVICE"].includes(existing.appointment.status)) throw new Error("APPOINTMENT_CLOSED");
        const partIds = [...new Set(amounts.items.flatMap((item) => item.partId === null ? [] : [item.partId]))];
        const parts = await transaction.sparePart.findMany({
          where: { id: { in: partIds }, stockCounted: true, priceConfigured: true },
          select: { id: true },
        });
        if (parts.length !== partIds.length) throw new Error("QUOTATION_PART_NOT_FOUND");
        await transaction.quotationItem.deleteMany({ where: { quotationId: existing.id } });
        const updated = await transaction.quotation.update({
          where: { id: existing.id },
          data: {
            expiresAt,
            notes: draftData.notes?.trim() || null,
            totalAmount: amounts.totalAmount,
            items: { create: amounts.items.map(({ itemType, partId, description, quantity, unitPrice, discountAmount, lineTotal }) => ({
              itemType, partId, description, quantity, unitPrice, discountAmount, lineTotal,
            })) },
          },
          include: { items: true },
        });
        await transaction.auditLog.create({
          data: buildAuditLogData({
            actorUserId: user.id,
            action: "QUOTATION_DRAFT_UPDATED",
            entityType: "Quotation",
            entityId: updated.id,
            request,
            details: { appointmentId: existing.appointmentId, itemCount: amounts.items.length, totalAmount: amounts.totalAmount.toString() },
          }),
        });
        return updated;
      });
      return Response.json({ quotation });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "QUOTATION_NOT_FOUND") return Response.json({ error: "Quotation was not found." }, { status: 404 });
        if (error.message === "QUOTATION_NOT_DRAFT") return Response.json({ error: "Only draft quotations can be edited." }, { status: 409 });
        if (error.message === "APPOINTMENT_CLOSED") return Response.json({ error: "Quotations cannot be updated for a closed appointment." }, { status: 409 });
        if (error.message === "QUOTATION_PART_NOT_FOUND") return Response.json({ error: "One or more selected spare parts no longer exist." }, { status: 400 });
      }
      if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
      console.error("Quotation draft update failed.", error);
      return Response.json({ error: "Quotation could not be updated." }, { status: 500 });
    }
  }

  const appUrl = validAppUrl(request);
  if (!appUrl) return Response.json({ error: "APP_URL must be configured with the public HTTPS application URL before sending quotations." }, { status: 503 });
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  try {
    const quotation = await prisma.$transaction(async (transaction) => {
      const current = await transaction.quotation.findUnique({
        where: { id: Number(rawId) },
        include: {
          items: { select: { id: true } },
          appointment: {
            select: {
              status: true,
              customer: { select: { name: true, email: true } },
              vehicle: { select: { registrationNumber: true } },
              service: { select: { name: true } },
            },
          },
        },
      });
      if (!current) throw new Error("QUOTATION_NOT_FOUND");
      if (current.status !== "DRAFT") throw new Error("QUOTATION_NOT_DRAFT");
      if (!["CHECKED_IN", "IN_SERVICE"].includes(current.appointment.status)) throw new Error("APPOINTMENT_CLOSED");
      if (!current.items.length || current.totalAmount.lte(0)) throw new Error("QUOTATION_EMPTY");
      if (!current.appointment.customer.email) throw new Error("CUSTOMER_EMAIL_MISSING");
      if (current.expiresAt <= new Date()) throw new Error("QUOTATION_EXPIRED");

      const sentAt = new Date();
      const changed = await transaction.quotation.updateMany({
        where: { id: current.id, status: "DRAFT", expiresAt: { gt: sentAt } },
        data: {
          status: "SENT",
          sentAt,
          approvalTokenHash: tokenHash,
        },
      });
      if (!changed.count) throw new Error("QUOTATION_NOT_DRAFT");
      await transaction.jobCard.updateMany({
        where: { appointmentId: current.appointmentId, status: { in: ["WAITING", "INSPECTION", "DIAGNOSIS"] } },
        data: { status: "AWAITING_APPROVAL" },
      });
      const updated = await transaction.quotation.findUnique({
        where: { id: current.id },
        select: {
          id: true,
          totalAmount: true,
          expiresAt: true,
          appointment: {
            select: {
              customer: { select: { name: true, email: true } },
              vehicle: { select: { registrationNumber: true } },
              service: { select: { name: true } },
            },
          },
        },
      });
      if (!updated) throw new Error("QUOTATION_NOT_FOUND");
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "QUOTATION_SENT",
          entityType: "Quotation",
          entityId: current.id,
          request,
          details: { totalAmount: current.totalAmount.toString(), expiresAt: current.expiresAt.toISOString() },
        }),
      });
      return updated;
    });

    const responseUrl = new URL("/quote-response", appUrl);
    responseUrl.searchParams.set("token", token);
    const emailNotification = await sendEmailNotification({
      to: quotation.appointment.customer.email,
      subject: `Quotation QUO-${String(quotation.id).padStart(6, "0")} for ${quotation.appointment.vehicle.registrationNumber}`,
      text: [
        `Hello ${quotation.appointment.customer.name},`,
        `Your quotation for ${quotation.appointment.service.name} on ${quotation.appointment.vehicle.registrationNumber} totals KSh ${new Prisma.Decimal(quotation.totalAmount).toFixed(2)}.`,
        `Please review and approve or reject it by ${quotation.expiresAt.toISOString().slice(0, 10)}:`,
        responseUrl.toString(),
      ].join("\n\n"),
    });
    if (!emailNotification.sent) {
      console.error("Quotation approval email was not delivered.", { quotationId: quotation.id, reason: emailNotification.reason });
    }
    return Response.json({
      quotation,
      emailNotification,
      ...(!emailNotification.sent ? { approvalLink: responseUrl.toString() } : {}),
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "QUOTATION_NOT_FOUND") return Response.json({ error: "Quotation was not found." }, { status: 404 });
      if (error.message === "QUOTATION_NOT_DRAFT") return Response.json({ error: "Only draft quotations can be sent." }, { status: 409 });
      if (error.message === "APPOINTMENT_CLOSED") return Response.json({ error: "Quotations cannot be updated for a closed appointment." }, { status: 409 });
      if (error.message === "QUOTATION_EMPTY") return Response.json({ error: "Add at least one priced item before sending this quotation." }, { status: 409 });
      if (error.message === "CUSTOMER_EMAIL_MISSING") return Response.json({ error: "Add an email address to the customer before sending this quotation." }, { status: 409 });
      if (error.message === "QUOTATION_EXPIRED") return Response.json({ error: "This draft quotation has expired. Create a new quotation with a future expiry date." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "A unique approval link could not be created; retry the send action." }, { status: 409 });
    }
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Quotation send failed.", error);
    return Response.json({ error: "Quotation could not be sent." }, { status: 500 });
  }
}
