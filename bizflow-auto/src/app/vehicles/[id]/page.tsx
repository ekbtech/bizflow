import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { getSessionUser } from "@/lib/auth";
import { getRoleHomePath, hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export default async function VehicleHistoryPage({ params }: PageProps<"/vehicles/[id]">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "vehicles:read")) redirect(getRoleHomePath(user.role));

  const { id: rawId } = await params;
  if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) notFound();
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: Number(rawId) },
    include: {
      customer: { select: { name: true, phone: true, email: true } },
      appointments: {
        orderBy: [{ appointmentDate: "desc" }, { appointmentTime: "desc" }],
        include: {
          service: { select: { name: true, price: true, priceConfigured: true } },
          jobCard: {
            include: {
              mechanic: { select: { name: true } },
              parts: { include: { part: { select: { name: true } } } },
              invoice: { select: { id: true, totalAmount: true, status: true } },
            },
          },
        },
      },
    },
  });
  if (!vehicle) notFound();

  return (
    <DashboardShell
      title={`${vehicle.make} ${vehicle.model}`}
      subtitle={`${vehicle.registrationNumber} · ${vehicle.year}`}
      active="Vehicles"
      actions={<Link href="/vehicles" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold">Back to vehicles</Link>}
    >
      <div className="space-y-6">
        <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft sm:grid-cols-2">
          <div><p className="text-sm text-slate-500">Owner</p><p className="mt-1 font-bold">{vehicle.customer.name}</p><p className="text-sm text-slate-600">{vehicle.customer.phone} · {vehicle.customer.email ?? "No email"}</p></div>
          <div><p className="text-sm text-slate-500">Vehicle</p><p className="mt-1 font-bold">{vehicle.color ?? "Color not recorded"} · {vehicle.mileage.toLocaleString()} km</p><p className="text-sm text-slate-600">{vehicle.registrationNumber}</p></div>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-black">Service history</h2>
          {vehicle.appointments.map((appointment) => (
            <article key={appointment.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div><h3 className="font-bold">{appointment.service.name}</h3><p className="text-sm text-slate-500">{appointment.appointmentDate.toLocaleDateString()} · {appointment.service.priceConfigured ? `KSh ${Number(appointment.service.price).toLocaleString()}` : "Price after inspection"}</p></div>
                <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{appointment.status}</span>
              </div>
              {appointment.description && <p className="mt-3 text-sm text-slate-600">Reported: {appointment.description}</p>}
              {appointment.jobCard && (
                <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 text-sm sm:grid-cols-2">
                  <p><strong>Mechanic:</strong> {appointment.jobCard.mechanic.name}</p>
                  <p><strong>Diagnosis:</strong> {appointment.jobCard.diagnosis ?? "—"}</p>
                  <p><strong>Work performed:</strong> {appointment.jobCard.workDone ?? "—"}</p>
                  <p><strong>Parts:</strong> {appointment.jobCard.parts.length ? appointment.jobCard.parts.map((usage) => `${usage.quantity} × ${usage.part.name}`).join(", ") : "None recorded"}</p>
                  {appointment.jobCard.invoice && <p><strong>Invoice:</strong> INV-{appointment.jobCard.invoice.id} · KSh {Number(appointment.jobCard.invoice.totalAmount).toLocaleString()} · {appointment.jobCard.invoice.status}</p>}
                </div>
              )}
            </article>
          ))}
          {vehicle.appointments.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">No service history recorded.</p>}
        </section>
      </div>
    </DashboardShell>
  );
}
