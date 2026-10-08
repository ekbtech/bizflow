import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { createSession, isDatabaseUnavailable, validateAuthConfiguration } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const registerSchema = z.object({
  name: z.string().trim().min(2).max(255),
  username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(5).max(50),
  whatsappOptIn: z.boolean().optional().default(false),
  password: z.string().min(6).max(128),
});

export async function POST(request: Request) {
  let input: unknown;

  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid registration details.", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    validateAuthConfiguration();
    const email = parsed.data.email.toLowerCase();
    const user = await prisma.$transaction(async (transaction) => {
      const created = await transaction.user.create({
        data: {
          name: parsed.data.name,
          username: parsed.data.username.toLowerCase(),
          email,
          passwordHash: await hash(parsed.data.password, 12),
          role: "CUSTOMER",
          customer: {
            create: {
              name: parsed.data.name,
              email,
              phone: parsed.data.phone,
              whatsappOptIn: parsed.data.whatsappOptIn,
            },
          },
        },
        select: { id: true, name: true, username: true, email: true, role: true },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: created.id,
          action: "ACCOUNT_REGISTERED",
          entityType: "User",
          entityId: created.id,
          request,
        }),
      });
      return created;
    });

    await createSession(user, request);
    return Response.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "That username or email is already in use." }, { status: 409 });
    }
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable. Check the server connection." }, { status: 503 });
    }
    if (error instanceof Error && error.message.startsWith("AUTH_SECRET")) {
      console.error("Registration is unavailable because session signing is not configured.", error);
      return Response.json({ error: "Authentication is not configured on the server." }, { status: 503 });
    }

    console.error("Customer registration failed.", error);
    return Response.json({ error: "Registration could not be completed." }, { status: 500 });
  }
}
