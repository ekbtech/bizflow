import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { getSessionUser, isDatabaseUnavailable } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const createSchema = z.object({
  leaveType: z.enum(["ANNUAL", "SICK", "COMPASSIONATE", "MATERNITY", "PATERNITY", "UNPAID", "STUDY", "OTHER"]),
  startDate: z.string().date(),
  endDate: z.string().date(),
  reason: z.string().trim().min(5).max(2000),
}).refine((data) => data.startDate <= data.endDate, {
  message: "End date must be the same as or later than start date.",
  path: ["endDate"],
});

function dateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!hasPermission(user.role, "leave:apply") && !hasPermission(user.role, "leave:manage")) {
    return Response.json({ error: "Leave requests are available to staff accounts only." }, { status: 403 });
  }

  try {
    const requests = await prisma.leaveRequest.findMany({
      where: hasPermission(user.role, "leave:manage") ? undefined : { userId: user.id },
      orderBy: [{ status: "asc" }, { startDate: "desc" }, { id: "desc" }],
      take: 500,
      include: {
        user: { select: { id: true, name: true, role: true } },
        reviewedBy: { select: { name: true } },
      },
    });
    return Response.json({ requests }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Leave request list query failed.", error);
    return Response.json({ error: "Leave requests could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!hasPermission(user.role, "leave:apply")) {
    return Response.json({ error: "Leave requests are available to staff accounts only." }, { status: 403 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Enter valid leave dates and reason.", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const startDate = dateOnly(parsed.data.startDate);
  const endDate = dateOnly(parsed.data.endDate);
  const today = dateOnly(new Date().toISOString().slice(0, 10));
  if (startDate < today) return Response.json({ error: "Leave cannot start in the past." }, { status: 400 });

  try {
    const leaveRequest = await prisma.$transaction(async (transaction) => {
      const conflict = await transaction.leaveRequest.findFirst({
        where: {
          userId: user.id,
          status: { in: ["PENDING", "APPROVED"] },
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
        select: { id: true },
      });
      if (conflict) throw new Error("LEAVE_DATES_CONFLICT");

      const created = await transaction.leaveRequest.create({
        data: { userId: user.id, leaveType: parsed.data.leaveType, startDate, endDate, reason: parsed.data.reason },
        include: { user: { select: { id: true, name: true, role: true } }, reviewedBy: { select: { name: true } } },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "LEAVE_REQUEST_SUBMITTED",
          entityType: "LeaveRequest",
          entityId: created.id,
          request,
          details: { leaveType: parsed.data.leaveType, startDate: parsed.data.startDate, endDate: parsed.data.endDate },
        }),
      });
      return created;
    });
    return Response.json({ request: leaveRequest }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "LEAVE_DATES_CONFLICT") {
      return Response.json({ error: "You already have a pending or approved leave request for those dates." }, { status: 409 });
    }
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Leave request submission failed.", error);
    return Response.json({ error: "Leave request could not be submitted." }, { status: 500 });
  }
}
