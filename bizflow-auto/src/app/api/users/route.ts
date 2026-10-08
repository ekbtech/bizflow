import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const accountFields = {
  name: z.string().trim().min(2).max(255),
  username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/),
  email: z.string().trim().email().max(255),
  password: z.string().min(6).max(128),
};
const createUserSchema = z.discriminatedUnion("role", [
  z.object({ ...accountFields, role: z.literal("ADMIN") }),
  z.object({ ...accountFields, role: z.literal("SUPER_ADMIN") }),
  z.object({ ...accountFields, role: z.literal("GARAGE_MANAGER") }),
  z.object({ ...accountFields, role: z.literal("SERVICE_ADVISOR") }),
  z.object({ ...accountFields, role: z.literal("STOREKEEPER") }),
  z.object({ ...accountFields, role: z.literal("ACCOUNTANT") }),
  z.object({
    ...accountFields,
    role: z.literal("MECHANIC"),
    phone: z.string().trim().min(5).max(50),
    specialization: z.string().trim().min(2).max(255),
  }),
]);

export async function GET() {
  const user = await requirePermission("users:manage");
  if (user instanceof Response) return user;

  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        createdAt: true,
        mechanic: { select: { specialization: true, status: true } },
      },
    });
    return Response.json({ users });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable." }, { status: 503 });
    }
    console.error("User list query failed.", error);
    return Response.json({ error: "Users could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requirePermission("users:manage");
  if (user instanceof Response) return user;

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid account details.", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const inputData = parsed.data;
    const email = inputData.email.toLowerCase();
    const created = await prisma.$transaction(async (transaction) => {
      const newUser = await transaction.user.create({
        data: {
          name: inputData.name,
          username: inputData.username.toLowerCase(),
          email,
          passwordHash: await hash(inputData.password, 12),
          role: inputData.role,
          ...(inputData.role === "MECHANIC"
            ? {
                mechanic: {
                  create: {
                    name: inputData.name,
                    email,
                    phone: inputData.phone,
                    specialization: inputData.specialization,
                  },
                },
              }
            : {}),
        },
        select: { id: true, name: true, username: true, email: true, role: true, createdAt: true },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "USER_CREATED",
          entityType: "User",
          entityId: newUser.id,
          request,
          details: { role: newUser.role },
        }),
      });
      return newUser;
    });

    return Response.json({ user: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "That username or email is already in use." }, { status: 409 });
    }
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable." }, { status: 503 });
    }
    console.error("Account creation failed.", error);
    return Response.json({ error: "Account could not be created." }, { status: 500 });
  }
}
