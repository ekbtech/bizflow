import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const customerSchema = z.object({
  name: z.string().trim().min(2).max(255),
  phone: z.string().trim().min(5).max(50),
  whatsappOptIn: z.boolean().optional().default(false),
  email: z.union([z.string().trim().email().max(255), z.literal("")]).optional(),
  address: z.string().trim().max(255).optional(),
});

export async function GET() {
  const user = await requirePermission("customers:read");
  if (user instanceof Response) return user;

  try {
    const customers = await prisma.customer.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        phone: true,
        whatsappOptIn: true,
        email: true,
        address: true,
        createdAt: true,
        _count: { select: { vehicles: true } },
      },
    });

    return Response.json({ customers });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable. Check the server connection." }, { status: 503 });
    }

    console.error("Customer list query failed.", error);
    return Response.json({ error: "Customers could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requirePermission("customers:write");
  if (user instanceof Response) return user;

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid customer details.", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const customer = await prisma.$transaction(async (transaction) => {
      const created = await transaction.customer.create({
        data: {
          name: parsed.data.name,
          phone: parsed.data.phone,
          whatsappOptIn: parsed.data.whatsappOptIn,
          email: parsed.data.email || null,
          address: parsed.data.address || null,
        },
      });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "CUSTOMER_CREATED",
          entityType: "Customer",
          entityId: created.id,
          request,
        }),
      });
      return created;
    });
    return Response.json({ customer }, { status: 201 });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable. Check the server connection." }, { status: 503 });
    }

    console.error("Customer creation failed.", error);
    return Response.json({ error: "Customer could not be created." }, { status: 500 });
  }
}
