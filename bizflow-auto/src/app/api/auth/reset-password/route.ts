import { createHash } from "node:crypto";
import { hash } from "bcryptjs";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const resetSchema = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(6).max(128),
});

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Use a valid reset link and a password of at least 6 characters." }, { status: 400 });
  }

  try {
    const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
    const user = await prisma.user.findFirst({
      where: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: { gt: new Date() } },
      select: { id: true },
    });
    if (!user) {
      return Response.json({ error: "This password reset link is invalid or expired. Request a new one." }, { status: 400 });
    }

    const passwordHash = await hash(parsed.data.password, 12);
    await prisma.$transaction(async (transaction) => {
      const result = await transaction.user.updateMany({
        where: { id: user.id, passwordResetTokenHash: tokenHash, passwordResetExpiresAt: { gt: new Date() } },
        data: {
          passwordHash,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          failedLoginAttempts: 0,
          lockedUntil: null,
          sessionVersion: { increment: 1 },
        },
      });
      if (result.count !== 1) throw new Error("INVALID_RESET_TOKEN");
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "PASSWORD_RESET_COMPLETED",
          entityType: "User",
          entityId: user.id,
          request,
        }),
      });
    });
    return Response.json({ message: "Your password has been reset. You can now sign in." });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_RESET_TOKEN") {
      return Response.json({ error: "This password reset link is invalid or expired. Request a new one." }, { status: 400 });
    }
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Password reset failed.", error);
    return Response.json({ error: "Password could not be reset." }, { status: 500 });
  }
}
