import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AuditEvent = {
  actorUserId: number | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  request?: Request;
  details?: Prisma.InputJsonValue;
};

export function buildAuditLogData({
  actorUserId,
  action,
  entityType,
  entityId,
  request,
  details,
}: AuditEvent): Prisma.AuditLogUncheckedCreateInput {
  const reportedIp = request?.headers.get("x-real-ip");

  return {
    actorUserId,
    action,
    entityType,
    entityId: entityId === undefined || entityId === null ? null : String(entityId),
    ipAddress: reportedIp && reportedIp.length <= 45 ? reportedIp : null,
    ...(details ? { details } : {}),
  };
}

export async function recordAuditEvent(event: AuditEvent) {
  try {
    await prisma.auditLog.create({ data: buildAuditLogData(event) });
  } catch (error) {
    console.error("Audit event could not be recorded.", {
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      error,
    });
    throw error;
  }
}
