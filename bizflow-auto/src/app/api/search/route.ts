import { getSessionUser, isDatabaseUnavailable } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

const querySchema = z.string().trim().min(2).max(80);

type SearchResult = {
  label: string;
  detail: string;
  category: string;
  href: string;
  icon: "customer" | "vehicle" | "appointment" | "job" | "invoice" | "parts";
};

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });

  const parsedQuery = querySchema.safeParse(new URL(request.url).searchParams.get("q"));
  if (!parsedQuery.success) return Response.json({ error: "Enter at least two characters to search." }, { status: 400 });
  const query = parsedQuery.data;

  try {
    const customerProfile = user.role === "CUSTOMER"
      ? await prisma.customer.findUnique({ where: { userId: user.id }, select: { id: true } })
      : null;
    const mechanicProfile = user.role === "MECHANIC"
      ? await prisma.mechanic.findUnique({ where: { userId: user.id }, select: { id: true } })
      : null;
    const parsedId = /^\d+$/.test(query) ? Number(query) : undefined;
    const numericId = parsedId !== undefined && Number.isSafeInteger(parsedId) ? parsedId : undefined;

    const [
      customers,
      vehicles,
      appointments,
      jobCards,
      invoices,
      spareParts,
    ] = await Promise.all([
      hasPermission(user.role, "customers:read")
        ? prisma.customer.findMany({
            where: { OR: [{ name: { contains: query } }, { email: { contains: query } }, { phone: { contains: query } }] },
            take: 4,
            select: { id: true, name: true, phone: true },
          })
        : Promise.resolve([]),
      hasPermission(user.role, "vehicles:read") || customerProfile
        ? prisma.vehicle.findMany({
            where: {
              ...(customerProfile ? { customerId: customerProfile.id } : {}),
              OR: [{ registrationNumber: { contains: query } }, { make: { contains: query } }, { model: { contains: query } }],
            },
            take: 4,
            select: { id: true, registrationNumber: true, make: true, model: true },
          })
        : Promise.resolve([]),
      hasPermission(user.role, "appointments:read") || customerProfile
        ? prisma.appointment.findMany({
            where: {
              ...(customerProfile ? { customerId: customerProfile.id } : {}),
              OR: [
                { customer: { name: { contains: query } } },
                { vehicle: { registrationNumber: { contains: query } } },
                { service: { name: { contains: query } } },
              ],
            },
            take: 4,
            include: {
              customer: { select: { name: true } },
              vehicle: { select: { registrationNumber: true, make: true, model: true } },
              service: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
      hasPermission(user.role, "jobCards:manage") || user.role === "MECHANIC"
        ? prisma.jobCard.findMany({
            where: {
              ...(mechanicProfile ? { mechanicId: mechanicProfile.id } : {}),
              ...(user.role === "MECHANIC" && !mechanicProfile ? { id: -1 } : {}),
              OR: [
                ...(numericId === undefined ? [] : [{ id: numericId }]),
                { appointment: { customer: { name: { contains: query } } } },
                { appointment: { vehicle: { registrationNumber: { contains: query } } } },
                { appointment: { service: { name: { contains: query } } } },
              ],
            },
            take: 4,
            include: {
              appointment: {
                include: {
                  customer: { select: { name: true } },
                  vehicle: { select: { registrationNumber: true, make: true, model: true } },
                  service: { select: { name: true } },
                },
              },
            },
          })
        : Promise.resolve([]),
      hasPermission(user.role, "invoices:read") || customerProfile
        ? prisma.invoice.findMany({
            where: {
              ...(customerProfile ? { customerId: customerProfile.id } : {}),
              OR: [
                ...(numericId === undefined ? [] : [{ id: numericId }]),
                { customer: { name: { contains: query } } },
                { vehicle: { registrationNumber: { contains: query } } },
              ],
            },
            take: 4,
            include: {
              customer: { select: { name: true } },
              vehicle: { select: { registrationNumber: true } },
            },
          })
        : Promise.resolve([]),
      hasPermission(user.role, "spareParts:read")
        ? prisma.sparePart.findMany({
            where: { OR: [{ name: { contains: query } }, { partNumber: { contains: query } }] },
            take: 4,
            select: { name: true, partNumber: true },
          })
        : Promise.resolve([]),
    ]);

    const results: SearchResult[] = [
      ...customers.map((customer) => ({
        label: customer.name,
        detail: customer.phone,
        category: "Customer",
        href: `/customers`,
        icon: "customer" as const,
      })),
      ...vehicles.map((vehicle) => ({
        label: `${vehicle.make} ${vehicle.model}`,
        detail: vehicle.registrationNumber,
        category: "Vehicle",
        href: customerProfile ? "/customer/dashboard#vehicles" : `/vehicles/${vehicle.id}`,
        icon: "vehicle" as const,
      })),
      ...appointments.map((appointment) => ({
        label: `${appointment.vehicle.make} ${appointment.vehicle.model}`,
        detail: `${appointment.customer.name} · ${appointment.service.name}`,
        category: "Appointment",
        href: customerProfile ? "/customer/dashboard#appointments" : "/appointments",
        icon: "appointment" as const,
      })),
      ...jobCards.map((job) => ({
        label: `${job.appointment.vehicle.make} ${job.appointment.vehicle.model}`,
        detail: `Job #${job.id} · ${job.appointment.customer.name} · ${job.appointment.service.name}`,
        category: "Service job",
        href: user.role === "MECHANIC" ? "/mechanic/dashboard" : "/job-cards",
        icon: "job" as const,
      })),
      ...invoices.map((invoice) => ({
        label: `Invoice #${invoice.id}`,
        detail: `${invoice.customer.name} · ${invoice.vehicle.registrationNumber}`,
        category: "Invoice",
        href: customerProfile ? "/customer/dashboard#invoices" : "/invoices",
        icon: "invoice" as const,
      })),
      ...spareParts.map((part) => ({
        label: part.name,
        detail: part.partNumber ?? "Spare part",
        category: "Inventory",
        href: "/spare-parts",
        icon: "parts" as const,
      })),
    ];

    return Response.json({ results: results.slice(0, 12) });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Global search failed.", error);
    return Response.json({ error: "Search could not be completed." }, { status: 500 });
  }
}
