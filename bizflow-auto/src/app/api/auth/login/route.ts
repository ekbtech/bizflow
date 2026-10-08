import { compare } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { createSession, isDatabaseUnavailable, validateAuthConfiguration } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(255),
  password: z.string().min(6).max(128),
});

export async function POST(request: Request) {
  let input: unknown;

  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Username, name, or password is invalid." }, { status: 400 });
  }

  try {
    validateAuthConfiguration();
    const identifier = parsed.data.identifier.trim();
    const matches = await prisma.user.findMany({
      where: {
        OR: [
          { email: identifier.toLowerCase() },
          { username: identifier.toLowerCase() },
          { name: identifier },
        ],
      },
      take: 2,
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        passwordHash: true,
        failedLoginAttempts: true,
        lockedUntil: true,
      },
    });

    if (matches.length > 1) {
      return Response.json(
        { error: "That name matches more than one account. Sign in with your unique username or email." },
        { status: 409 },
      );
    }

    const user = matches[0];
    const currentlyLocked = user?.lockedUntil && user.lockedUntil > new Date();
    if (currentlyLocked) {
      return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
    }

    if (!user || !(await compare(parsed.data.password, user.passwordHash))) {
      if (user) {
        await prisma.$transaction(async (transaction) => {
          await transaction.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`);
          const current = await transaction.user.findUnique({
            where: { id: user.id },
            select: { failedLoginAttempts: true, lockedUntil: true },
          });
          if (!current || (current.lockedUntil && current.lockedUntil > new Date())) return;

          const attempts = (current.lockedUntil ? 0 : current.failedLoginAttempts) + 1;
          const lockAccount = attempts >= 5;
          const now = new Date();
          const lockedUntil = lockAccount ? new Date(now.getTime() + 15 * 60 * 1000) : null;
          await transaction.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: lockAccount ? 0 : attempts,
              lockedUntil,
              ...(lockAccount ? { sessionVersion: { increment: 1 } } : {}),
            },
          });
          await transaction.auditLog.create({
            data: buildAuditLogData({
              actorUserId: user.id,
              action: lockAccount ? "ACCOUNT_LOCKED" : "LOGIN_FAILED",
              entityType: "User",
              entityId: user.id,
              request,
              details: lockAccount ? { durationMinutes: 15 } : { failedAttempts: attempts },
            }),
          });
        });
      }
      return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
    }

    const sessionUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
    };
    await prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "LOGIN_SUCCEEDED",
          entityType: "User",
          entityId: user.id,
          request,
        }),
      });
    });
    await createSession(sessionUser, request);
    return Response.json({ user: sessionUser });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable. Check the server connection." }, { status: 503 });
    }
    if (error instanceof Error && error.message.startsWith("AUTH_SECRET")) {
      console.error("Login is unavailable because session signing is not configured.", error);
      return Response.json({ error: "Authentication is not configured on the server." }, { status: 503 });
    }

    console.error("Login failed.", error);
    return Response.json({ error: "Login could not be completed." }, { status: 500 });
  }
}
