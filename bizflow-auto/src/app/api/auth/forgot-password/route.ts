import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { recordAuditEvent } from "@/lib/audit";
import { isDatabaseUnavailable } from "@/lib/auth";
import { sendEmailNotification } from "@/lib/email";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const requestSchema = z.object({ email: z.string().trim().email().max(255) });
const genericResponse = {
  message: "If an account exists for that email, password reset instructions will be sent shortly.",
};

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: "Enter a valid email address." }, { status: 400 });

  try {
    await recordAuditEvent({
      actorUserId: null,
      action: "PASSWORD_RESET_REQUESTED",
      entityType: "User",
      request,
    });

    const appUrl = process.env.APP_URL?.trim() || (process.env.NODE_ENV === "development" ? "http://localhost:3001" : "");
    if (!appUrl || !process.env.RESEND_API_KEY?.trim() || !process.env.RESEND_FROM_EMAIL?.trim()) {
      return Response.json({ error: "Password reset email is not configured. Contact the garage administrator." }, { status: 503 });
    }
    let appOrigin: URL;
    try {
      appOrigin = new URL(appUrl);
    } catch {
      console.error("Password reset email was not sent because APP_URL is invalid.");
      return Response.json({ error: "Password reset email is not configured. Contact the garage administrator." }, { status: 503 });
    }
    if (appOrigin.protocol !== "https:" && appOrigin.hostname !== "localhost") {
      console.error("Password reset email was not sent because APP_URL must use HTTPS.");
      return Response.json({ error: "Password reset email is not configured. Contact the garage administrator." }, { status: 503 });
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
      select: { id: true, email: true },
    });
    if (!user) return Response.json(genericResponse);

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    const resetUrl = new URL("/reset-password", appOrigin);
    resetUrl.searchParams.set("token", token);
    const result = await sendEmailNotification({
      to: user.email,
      subject: "Reset your BizFlow Auto password",
      text: `Use this link to reset your password. The link expires in 30 minutes and can only be used once:\n\n${resetUrl.toString()}\n\nIf you did not request this, you can ignore this email.`,
    });
    if (!result.sent) {
      console.error("Password reset email could not be sent.", { reason: result.reason });
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordResetTokenHash: null, passwordResetExpiresAt: null },
      });
    }
    return Response.json(genericResponse);
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Password reset request failed.", error);
    return Response.json({ error: "Password reset could not be requested." }, { status: 500 });
  }
}
