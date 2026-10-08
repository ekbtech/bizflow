import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { getSessionUser, isDatabaseUnavailable } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const updateSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "CANCEL"]),
  responseNote: z.string().trim().max(2000).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  const { id: rawId } = await context.params;
  if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) {
    return Response.json({ error: "Invalid leave request ID." }, { status: 400 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Invalid leave request decision.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const canManage = hasPermission(user.role, "leave:manage");
  if (parsed.data.action === "CANCEL" ? !hasPermission(user.role, "leave:apply") : !canManage) {
    return Response.json({ error: "You do not have permission to update this leave request." }, { status: 403 });
  }

  try {
    const updated = await prisma.$transaction(async (transaction) => {
      const current = await transaction.leaveRequest.findUnique({
        where: { id: Number(rawId) },
        select: { id: true, userId: true, status: true },
      });
      if (!current) throw new Error("LEAVE_REQUEST_NOT_FOUND");
      if (parsed.data.action === "CANCEL") {
        if (current.userId !== user.id) throw new Error("LEAVE_REQUEST_FORBIDDEN");
      } else if (current.userId === user.id) {
        throw new Error("LEAVE_SELF_REVIEW");
      }
      if (current.status !== "PENDING") throw new Error("LEAVE_REQUEST_NOT_PENDING");

      const status = parsed.data.action === "APPROVE" ? "APPROVED"
        : parsed.data.action === "REJECT" ? "REJECTED" : "CANCELLED";
      const result = await transaction.leaveRequest.updateMany({
        where: { id: current.id, status: "PENDING", ...(parsed.data.action === "CANCEL" ? { userId: user.id } : {}) },
        data: {
          status,
          ...(parsed.data.action === "CANCEL"
            ? {}
            : { responseNote: parsed.data.responseNote?.trim() || null, reviewedByUserId: user.id, reviewedAt: new Date() }),
        },
      });
      if (!result.count) throw new Error("LEAVE_REQUEST_NOT_PENDING");
      const leaveRequest = await transaction.leaveRequest.findUniqueOrThrow({
        where: { id: current.id },
        include: { user: { select: { id: true, name: true, role: true } }, reviewedBy: { select: { name: true } } },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: `LEAVE_REQUEST_${status}`,
          entityType: "LeaveRequest",
          entityId: current.id,
          request,
          details: parsed.data.responseNote ? { responseNote: parsed.data.responseNote } : undefined,
        }),
      });
      return leaveRequest;
    });
    return Response.json({ request: updated });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "LEAVE_REQUEST_NOT_FOUND") return Response.json({ error: "Leave request was not found." }, { status: 404 });
      if (error.message === "LEAVE_REQUEST_FORBIDDEN") return Response.json({ error: "You can only cancel your own request." }, { status: 403 });
      if (error.message === "LEAVE_SELF_REVIEW") return Response.json({ error: "Managers cannot review their own leave request." }, { status: 409 });
      if (error.message === "LEAVE_REQUEST_NOT_PENDING") return Response.json({ error: "Only pending leave requests can be updated." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return Response.json({ error: "Leave request was not found." }, { status: 404 });
    }
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Leave request update failed.", error);
    return Response.json({ error: "Leave request could not be updated." }, { status: 500 });
  }
}
