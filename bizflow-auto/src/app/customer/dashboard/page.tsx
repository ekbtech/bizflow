import Link from "next/link";
import { redirect } from "next/navigation";
import { CustomerActions } from "@/components/customer-actions";
import { DashboardShell } from "@/components/dashboard-shell";
import { DashboardOverview, DashboardTrendChart } from "@/components/dashboard-overview";
import { MpesaPaymentButton } from "@/components/mpesa-payment-button";
import { WhatsAppReminderPreference } from "@/components/whatsapp-reminder-preference";
import { ModuleIcon } from "@/components/module-icon";
import { getSessionUser, isDatabaseUnavailable } from "@/lib/auth";
import { getRoleHomePath } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export default async function CustomerDashboardPage() {
  const user = await getSessionUser();

  if (!user) redirect("/login");
  if (user.role !== "CUSTOMER") redirect(getRoleHomePath(user.role));

  const customer = await prisma.customer.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      name: true,
      phone: true,
      whatsappOptIn: true,
      vehicles: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          registrationNumber: true,
          make: true,
          model: true,
          year: true,
          mileage: true,
          appointments: {
            where: { status: "COMPLETED" },
            orderBy: { appointmentDate: "desc" },
            take: 1,
            select: { appointmentDate: true, service: { select: { name: true } } },
          },
        },
      },
      appointments: {
        orderBy: [{ appointmentDate: "desc" }, { appointmentTime: "desc" }],
        take: 20,
        select: {
          id: true,
          appointmentDate: true,
          appointmentTime: true,
          status: true,
          priority: true,
          advisor: { select: { name: true } },
          service: { select: { name: true } },
          vehicle: { select: { registrationNumber: true, make: true, model: true } },
          jobCard: { select: { status: true, diagnosis: true, workDone: true } },
        },
      },
      invoices: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          totalAmount: true,
          status: true,
          createdAt: true,
          vehicle: { select: { registrationNumber: true } },
          items: { select: { itemName: true, quantity: true, unitPrice: true, discountAmount: true, lineTotal: true } },
          payments: {
            select: {
              amount: true,
              paymentMethod: true,
              paymentDate: true,
              status: true,
              receipt: { select: { id: true, receiptNumber: true } },
            },
          },
        },
      },
    },
  }).catch((error: unknown) => {
    if (isDatabaseUnavailable(error)) {
      console.error("Customer dashboard could not reach the database.", error);
      throw new Error("The customer dashboard is temporarily unavailable because the database could not be reached.");
    }

    console.error("Customer dashboard data query failed.", error);
    throw error;
  });

  if (!customer) {
    throw new Error("This customer account has no linked customer profile. Contact the garage administrator.");
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 6);
  const [upcomingAppointments, weekAppointments, outstanding, pendingQuotes] = await Promise.all([
    prisma.appointment.findMany({
      where: { customerId: customer.id, appointmentDate: { gte: today }, status: { in: ["REQUESTED", "CONFIRMED", "CHECKED_IN", "IN_SERVICE"] } },
      orderBy: [{ appointmentDate: "asc" }, { appointmentTime: "asc" }],
      take: 6,
      include: { vehicle: { select: { make: true, model: true } }, service: { select: { name: true } } },
    }),
    prisma.appointment.findMany({
      where: { customerId: customer.id, appointmentDate: { gte: weekStart, lt: tomorrow } },
      select: { appointmentDate: true, status: true },
    }),
    prisma.invoice.findMany({
      where: { customerId: customer.id, status: { in: ["PENDING", "OVERDUE"] } },
      select: {
        totalAmount: true,
        payments: { where: { status: "PAID" }, select: { amount: true } },
      },
    }),
    prisma.quotation.count({
      where: { status: "SENT", appointment: { customerId: customer.id } },
    }),
  ]);
  const trendDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    const items = weekAppointments.filter((appointment) =>
      appointment.appointmentDate.getFullYear() === date.getFullYear() &&
      appointment.appointmentDate.getMonth() === date.getMonth() &&
      appointment.appointmentDate.getDate() === date.getDate()
    );
    return {
      label: date.toLocaleDateString("en-KE", { day: "numeric", month: "short" }),
      bookings: items.length,
      completed: items.filter((appointment) => appointment.status === "COMPLETED").length,
      pending: items.filter((appointment) => appointment.status === "REQUESTED").length,
    };
  });
  const outstandingBalance = outstanding.reduce((balance, invoice) => {
    const paid = invoice.payments.reduce((total, payment) => total + Number(payment.amount), 0);
    return balance + Math.max(0, Number(invoice.totalAmount) - paid);
  }, 0);

  return (
    <DashboardShell
      title="Dashboard"
      subtitle="Here’s what’s happening with your vehicles today."
      active="My account"
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/customer/dashboard#book-service" className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
            <ModuleIcon name="appointment" />Book Service
          </Link>
          <Link href="/customer/dashboard#add-vehicle" className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <ModuleIcon name="vehicle" />Add Vehicle
          </Link>
          <Link href="/customer/quotations" className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <ModuleIcon name="quote" />Quotes
          </Link>
        </div>
      }
    >
        <DashboardOverview
          metrics={[
            { label: "Vehicles", icon: "vehicle", value: customer.vehicles.length.toLocaleString() },
            { label: "Upcoming Appointments", icon: "appointment", value: upcomingAppointments.length.toLocaleString() },
            { label: "Quotes To Review", icon: "quote", value: pendingQuotes.toLocaleString() },
            { label: "Outstanding Balance", icon: "invoice", value: `KSh ${outstandingBalance.toLocaleString("en-KE")}` },
            { label: "Service Reminders", icon: "service", value: customer.whatsappOptIn ? "On" : "Off" },
          ]}
          chartTitle="Service Overview"
          chartIcon="report"
          chart={
            <DashboardTrendChart
              labels={trendDays.map((day) => day.label)}
              series={[
                { label: "Bookings", color: "#3b82f6", values: trendDays.map((day) => day.bookings), kind: "bar" },
                { label: "Completed", color: "#10b981", values: trendDays.map((day) => day.completed), kind: "line" },
                { label: "Waiting", color: "#f59e0b", values: trendDays.map((day) => day.pending), kind: "line" },
              ]}
            />
          }
          scheduleTitle="Upcoming Appointments"
          scheduleIcon="appointment"
          scheduleHref="/customer/dashboard#appointments"
          schedule={
            upcomingAppointments.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {upcomingAppointments.map((appointment) => (
                  <div key={appointment.id} className="flex items-center gap-2 py-2.5 first:pt-0 last:pb-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                      <ModuleIcon name="vehicle" className="h-4 w-4 text-slate-600" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold">{appointment.vehicle.make} {appointment.vehicle.model}</span>
                      <span className="block truncate text-[11px] text-slate-500">{appointment.service.name} · {appointment.appointmentDate.toLocaleDateString()}</span>
                    </span>
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">{appointment.status.replaceAll("_", " ").toLowerCase()}</span>
                  </div>
                ))}
              </div>
            ) : <p className="py-8 text-center text-xs text-slate-500">No upcoming appointments.</p>
          }
          recentTitle="Recent Bills"
          recentIcon="invoice"
          recentHref="/customer/dashboard#invoices"
          recent={
            customer.invoices.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {customer.invoices.slice(0, 5).map((invoice) => (
                  <div key={invoice.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-xs font-bold">INV-{invoice.id} · {invoice.vehicle.registrationNumber}</p>
                      <p className="text-[11px] text-slate-500">{invoice.createdAt.toLocaleDateString()} · KSh {Number(invoice.totalAmount).toLocaleString()}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700">{invoice.status.toLowerCase()}</span>
                  </div>
                ))}
              </div>
            ) : <p className="py-8 text-center text-xs text-slate-500">No bills are available yet.</p>
          }
          actions={[
            { label: "Book Service", href: "/customer/dashboard#book-service", icon: "appointment", tone: "blue" },
            { label: "Add Vehicle", href: "/customer/dashboard#add-vehicle", icon: "vehicle", tone: "green" },
            { label: "Review Quotes", href: "/customer/quotations", icon: "quote", tone: "purple" },
            { label: "View Bills", href: "/customer/dashboard#invoices", icon: "invoice", tone: "amber" },
            { label: "Service Reminders", href: "/customer/dashboard#reminders", icon: "service", tone: "cyan" },
          ]}
        />

        <CustomerActions
          vehicles={customer.vehicles}
          minAppointmentDate={now.toISOString().slice(0, 10)}
          maxVehicleYear={now.getUTCFullYear() + 1}
        />
        <WhatsAppReminderPreference initialValue={customer.whatsappOptIn} />

        <section id="vehicles" className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="mb-4">
            <h2 className="flex items-center gap-2 text-xl font-black"><ModuleIcon name="vehicle" />Cars</h2>
          </div>

          {customer.vehicles.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              No vehicles are linked to your account yet. Contact the garage to add your vehicle.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {customer.vehicles.map((vehicle) => (
                <article key={vehicle.id} className="rounded-xl border border-slate-200 p-4">
                  <p className="font-bold">
                    {vehicle.make} {vehicle.model} ({vehicle.year})
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{vehicle.registrationNumber}</p>
                  <p className="mt-1 text-sm text-slate-500">{vehicle.mileage.toLocaleString()} km</p>
                  {vehicle.appointments[0] && (
                    <>
                      <p className="mt-2 text-sm text-slate-600">
                        Last service: {vehicle.appointments[0].service.name} · {vehicle.appointments[0].appointmentDate.toLocaleDateString()}
                      </p>
                      {(() => {
                        const nextDue = new Date(vehicle.appointments[0].appointmentDate);
                        nextDue.setDate(nextDue.getDate() + 90);
                        return nextDue <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) ? (
                          <p className="mt-1 text-sm font-semibold text-orange-700">Service reminder: due {nextDue.toLocaleDateString()}</p>
                        ) : null;
                      })()}
                    </>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section id="appointments" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-black"><ModuleIcon name="appointment" />Bookings</h2>

          {customer.appointments.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              You don&apos;t have any appointments yet. Contact the garage to schedule a service.
            </p>
          ) : (
            <div className="space-y-3">
              {customer.appointments.map((appointment) => (
                <article
                  key={appointment.id}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold">{appointment.service.name}</p>
                    <p className="text-sm text-slate-500">
                      {appointment.vehicle.make} {appointment.vehicle.model} · {appointment.vehicle.registrationNumber}
                    </p>
                  </div>
                  <div className="text-sm text-slate-600 sm:text-right">
                    <p>{appointment.appointmentDate.toLocaleDateString()} · {appointment.appointmentTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: "UTC" })}</p>
                    <p>{appointment.status.replaceAll("_", " ").toLowerCase()} · {appointment.priority.toLowerCase()} priority</p>
                    {appointment.advisor && <p>Advisor: {appointment.advisor.name}</p>}
                    {appointment.jobCard && <p>Job progress: {appointment.jobCard.status.replaceAll("_", " ").toLowerCase()}</p>}
                    {appointment.jobCard?.diagnosis && <p>Diagnosis: {appointment.jobCard.diagnosis}</p>}
                    {appointment.jobCard?.workDone && <p>Work: {appointment.jobCard.workDone}</p>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section id="invoices" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-black"><ModuleIcon name="invoice" />Bills</h2>
          {customer.invoices.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No invoices are available yet.</p>
          ) : (
            <div className="space-y-3">
              {customer.invoices.map((invoice) => (
                <article key={invoice.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold">Invoice INV-{invoice.id}</p>
                      <p className="text-sm text-slate-500">
                        {invoice.vehicle.registrationNumber} · {invoice.createdAt.toLocaleDateString()}
                      </p>
                    </div>
                    <div className="sm:text-right">
                      <p className="font-bold">KSh {Number(invoice.totalAmount).toLocaleString()}</p>
                      <p className="text-sm text-slate-600">{invoice.status.toLowerCase()}</p>
                    </div>
                  </div>
                  {invoice.items.length > 0 && (
                    <p className="mt-2 text-sm text-slate-600">
                      Items: {invoice.items.map((item) => `${item.quantity} × ${item.itemName}`).join(", ")}
                    </p>
                  )}
                  {invoice.payments.length > 0 && (
                    <p className="mt-1 text-sm text-slate-500">
                      Payments: {invoice.payments.map((payment) => (
                        <span key={`${payment.receipt?.id ?? payment.paymentDate.toISOString()}-${payment.amount}`} className="mr-2 inline-flex flex-wrap items-center gap-1">
                          KSh {Number(payment.amount).toLocaleString()} {payment.paymentMethod.toLowerCase()} ({payment.status.toLowerCase()})
                          {payment.receipt && <Link href={`/receipts/${payment.receipt.id}`} className="font-semibold text-orange-700">Receipt {payment.receipt.receiptNumber}</Link>}
                        </span>
                      ))}
                    </p>
                  )}
                  {(() => {
                    const paid = invoice.payments
                      .filter((payment) => payment.status === "PAID")
                      .reduce((sum, payment) => sum + Number(payment.amount), 0);
                    const balance = Math.max(0, Number(invoice.totalAmount) - paid);
                    return balance > 0 ? (
                      <div className="mt-3 border-t border-slate-100 pt-3">
                        <p className="text-sm font-semibold">Balance due: KSh {balance.toLocaleString()}</p>
                        <MpesaPaymentButton invoiceId={invoice.id} />
                      </div>
                    ) : null;
                  })()}
                </article>
              ))}
            </div>
          )}
        </section>
    </DashboardShell>
  );
}
