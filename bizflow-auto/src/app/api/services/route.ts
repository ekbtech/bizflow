import { z } from "zod";
import { buildAuditLogData } from "@/lib/audit";
import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const serviceSchema = z.object({
  name: z.string().trim().min(2).max(255),
  price: z.coerce.number().positive().max(10_000_000),
  category: z.string().trim().min(2).max(100).optional(),
  vehicleType: z.enum(["CAR", "BICYCLE", "MOTORBIKE", "UNIVERSAL"]).optional(),
  mechanicSpecialty: z.string().trim().min(2).max(120).optional(),
});

export async function GET() {
  try {
    const services = await prisma.service.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, price: true, priceConfigured: true,
        category: true, vehicleType: true, mechanicSpecialty: true,
      },
    });
    return Response.json({ services }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable." }, { status: 503 });
    }
    console.error("Service list query failed.", error);
    return Response.json({ error: "Services could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requirePermission("services:write");
  if (user instanceof Response) return user;

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid service details.", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const service = await prisma.$transaction(async (transaction) => {
      const created = await transaction.service.create({ data: parsed.data });
      await transaction.auditLog.create({
        data: buildAuditLogData({
          actorUserId: user.id,
          action: "SERVICE_CREATED",
          entityType: "Service",
          entityId: created.id,
          request,
        }),
      });
      return created;
    });
    return Response.json({ service }, { status: 201 });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return Response.json({ error: "The database is unavailable." }, { status: 503 });
    }
    console.error("Service creation failed.", error);
    return Response.json({ error: "Service could not be created." }, { status: 500 });
  }
}
