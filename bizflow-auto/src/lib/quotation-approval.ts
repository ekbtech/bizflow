import { buildAuditLogData } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

type DecisionArgs = {
  quotationId?: number;
  decision: "APPROVE" | "REJECT";
  request: Request;
  userId?: number;
  tokenHash?: string;
};

export async function decideQuotation({ quotationId, decision, request, userId, tokenHash }: DecisionArgs) {
  return prisma.$transaction(async (transaction) => {
    if (quotationId === undefined && tokenHash === undefined) return { error: "NOT_FOUND" as const };
    const quotation = await transaction.quotation.findFirst({
      where: {
        ...(quotationId !== undefined ? { id: quotationId } : {}),
        ...(tokenHash !== undefined ? { approvalTokenHash: tokenHash } : {}),
      },
      select: {
        id: true,
        appointmentId: true,
        status: true,
        expiresAt: true,
        approvalTokenHash: true,
        appointment: { select: { status: true, customer: { select: { userId: true } } } },
      },
    });
    if (!quotation) return { error: "NOT_FOUND" as const };
    if (userId !== undefined && quotation.appointment.customer.userId !== userId) {
      return { error: "FORBIDDEN" as const };
    }
    if (tokenHash !== undefined && quotation.approvalTokenHash !== tokenHash) {
      return { error: "NOT_FOUND" as const };
    }
    if (quotation.status !== "SENT") return { error: "NOT_PENDING" as const };

    const now = new Date();
    if (quotation.expiresAt <= now) {
      await transaction.quotation.updateMany({
        where: { id: quotation.id, status: "SENT" },
        data: { status: "EXPIRED", approvalTokenHash: null },
      });
      await transaction.jobCard.updateMany({
        where: { appointmentId: quotation.appointmentId, status: "AWAITING_APPROVAL" },
        data: { status: "DIAGNOSIS" },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: null,
          action: "QUOTATION_EXPIRED",
          entityType: "Quotation",
          entityId: quotation.id,
          request,
          details: { reason: "approval_deadline_passed" },
        }),
      });
      return { error: "EXPIRED" as const };
    }
    if (!["CHECKED_IN", "IN_SERVICE"].includes(quotation.appointment.status)) {
      return { error: "APPOINTMENT_CLOSED" as const };
    }

    const changed = await transaction.quotation.updateMany({
      where: {
        id: quotation.id,
        status: "SENT",
        expiresAt: { gt: now },
        ...(tokenHash !== undefined ? { approvalTokenHash: tokenHash } : {}),
      },
      data: {
        status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
        approvedByUserId: userId ?? null,
        approvedAt: decision === "APPROVE" ? now : null,
        rejectedAt: decision === "REJECT" ? now : null,
        approvalTokenHash: null,
      },
    });
    if (!changed.count) return { error: "NOT_PENDING" as const };

    if (decision === "APPROVE") {
      await transaction.jobCard.updateMany({
        where: { appointmentId: quotation.appointmentId },
        data: { quotationId: quotation.id, status: "WAITING" },
      });
    } else {
      await transaction.jobCard.updateMany({
        where: { appointmentId: quotation.appointmentId, status: "AWAITING_APPROVAL" },
        data: { status: "DIAGNOSIS" },
      });
    }
    await transaction.auditLog.create({
      data: buildAuditLogData({
        actorUserId: userId ?? null,
        action: decision === "APPROVE" ? "QUOTATION_APPROVED" : "QUOTATION_REJECTED",
        entityType: "Quotation",
        entityId: quotation.id,
        request,
        details: { appointmentId: quotation.appointmentId, decisionChannel: tokenHash ? "email_link" : "customer_portal" },
      }),
    });
    const updated = await transaction.quotation.findUnique({
      where: { id: quotation.id },
      select: { id: true, status: true, totalAmount: true, approvedAt: true, rejectedAt: true },
    });
    if (!updated) return { error: "NOT_PENDING" as const };
    return { quotation: updated };
  });
}
