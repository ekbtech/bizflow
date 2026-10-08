import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { DashboardOverview, DashboardTrendChart } from "@/components/dashboard-overview";
import { ModuleIcon } from "@/components/module-icon";
import { StaffRoleDashboard } from "@/components/staff-role-dashboard";
import { getSessionUser } from "@/lib/auth";
import { getRoleHomePath, hasPermission } from "@/lib/permissions";
import { DEFAULT_REORDER_LEVEL } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const runtime = "nodejs";

const currency = (amount: number) =>
  `KSh ${amount.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "dashboard:read")) redirect(getRoleHomePath(user.role));
  if (user.role === "CUSTOMER") redirect(getRoleHomePath(user.role));
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN" && user.role !== "GARAGE_MANAGER") {
    return <StaffRoleDashboard role={user.role} userId={user.id} />;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const firstChartDay = new Date(today);
  firstChartDay.setDate(firstChartDay.getDate() - 6);
  const [vehicleCount, todayAppointmentCount, parts, activeJobCount, todayPayments, todayAppointments, recentJobs, chartPayments, chartExpenses, chartJobs] =
    await Promise.all([
      prisma.vehicle.count(),
      prisma.appointment.count({ where: { appointmentDate: { gte: today, lt: tomorrow } } }),
      prisma.sparePart.findMany({
        where: { stockCounted: true },
        select: { id: true, name: true, quantity: true, reorderLevel: true },
      }),
      prisma.jobCard.count({ where: { status: { notIn: ["DELIVERED", "CANCELLED"] } } }),
      prisma.payment.aggregate({
        where: { status: "PAID", paymentDate: { gte: today, lt: tomorrow } },
        _sum: { amount: true },
      }),
      prisma.appointment.findMany({
        where: { appointmentDate: { gte: today, lt: tomorrow } },
        orderBy: [{ appointmentTime: "asc" }],
        take: 5,
        include: {
          customer: { select: { name: true } },
          vehicle: { select: { make: true, model: true, registrationNumber: true } },
          service: { select: { name: true } },
        },
      }),
      prisma.jobCard.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          mechanic: { select: { name: true } },
          appointment: {
            include: {
              customer: { select: { name: true } },
              vehicle: { select: { registrationNumber: true } },
              service: { select: { name: true } },
            },
          },
        },
      }),
      prisma.payment.findMany({
        where: { status: "PAID", paymentDate: { gte: firstChartDay, lt: tomorrow } },
        select: { amount: true, paymentDate: true },
      }),
      prisma.expense.findMany({
        where: { expenseDate: { gte: firstChartDay, lt: tomorrow } },
        select: { amount: true, expenseDate: true },
      }),
      prisma.jobCard.findMany({
        where: { createdAt: { gte: firstChartDay, lt: tomorrow } },
        select: { status: true, createdAt: true, completedAt: true },
      }),
    ]);

  const lowStockParts = parts.filter((part) => part.quantity <= (part.reorderLevel || DEFAULT_REORDER_LEVEL));
  const lowStockCount = lowStockParts.length;
  const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(firstChartDay);
    day.setDate(day.getDate() + index);
    const isSameDay = (date: Date) =>
      date.getFullYear() === day.getFullYear() && date.getMonth() === day.getMonth() && date.getDate() === day.getDate();
    return {
      label: day.toLocaleDateString("en-KE", { day: "numeric", month: "short" }),
      revenue: chartPayments.filter((payment) => isSameDay(payment.paymentDate)).reduce((sum, payment) => sum + Number(payment.amount), 0),
      completed: chartJobs.filter((job) => job.status === "COMPLETED" && job.completedAt && isSameDay(job.completedAt)).length,
      pending: chartJobs.filter((job) => !["COMPLETED", "DELIVERED", "CANCELLED"].includes(job.status) && isSameDay(job.createdAt)).length,
      expenses: chartExpenses.filter((expense) => isSameDay(expense.expenseDate)).reduce((sum, expense) => sum + Number(expense.amount), 0),
    };
  });

  return (
    <DashboardShell
      title="Dashboard"
      subtitle="Here’s what’s happening in your garage today."
      active="Dashboard"
      actions={
        <>
          <Link href="/job-cards" className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"><ModuleIcon name="job" />Create Service Job</Link>
          <Link href="/vehicles" className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><ModuleIcon name="vehicle" />Add Vehicle</Link>
          <Link href="/customers" className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><ModuleIcon name="customer" />Add Customer</Link>
        </>
      }
    >
      {lowStockParts.length > 0 && (
        <section role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold">Low-stock alert: {lowStockParts.length} {lowStockParts.length === 1 ? "part" : "parts"} at or below reorder level</h2>
              <p className="mt-1 text-sm">Review stock and arrange replenishment.</p>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {lowStockParts.slice(0, 5).map((part) => (
                  <li key={part.id}>{part.name}: {part.quantity} remaining (reorder at {part.reorderLevel || DEFAULT_REORDER_LEVEL})</li>
                ))}
                {lowStockParts.length > 5 && <li>And {lowStockParts.length - 5} more</li>}
              </ul>
            </div>
            <Link href="/spare-parts" className="w-fit rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-800">
              Review stock
            </Link>
          </div>
        </section>
      )}
      <DashboardOverview
        metrics={[
          { label: "Vehicles", icon: "vehicle", value: vehicleCount.toLocaleString(), tone: "blue" },
          { label: "Active Jobs", icon: "job", value: activeJobCount.toLocaleString(), tone: "green" },
          { label: "Today's Appointments", icon: "appointment", value: todayAppointmentCount.toLocaleString(), tone: "purple" },
          { label: "Today's Revenue", icon: "payment", value: currency(Number(todayPayments._sum.amount ?? 0)), tone: "amber" },
          { label: "Low Stock", icon: "parts", value: `${lowStockCount} items`, tone: "rose" },
        ]}
        chartTitle="Revenue Overview"
        chartIcon="report"
        chart={
          <DashboardTrendChart
            labels={lastSevenDays.map((day) => day.label)}
            series={[
              { label: "Revenue", color: "#3b82f6", values: lastSevenDays.map((day) => day.revenue), kind: "bar" },
              { label: "Completed Jobs", color: "#10b981", values: lastSevenDays.map((day) => day.completed), kind: "line" },
              { label: "Pending Jobs", color: "#f59e0b", values: lastSevenDays.map((day) => day.pending), kind: "line" },
              { label: "Expenses", color: "#ec4899", values: lastSevenDays.map((day) => day.expenses), kind: "line" },
            ]}
          />
        }
        scheduleTitle="Today's Appointments"
        scheduleHref="/appointments"
        schedule={
          todayAppointments.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {todayAppointments.map((appointment) => (
                <div key={appointment.id} className="flex items-center gap-2 py-2.5 first:pt-0 last:pb-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                    <ModuleIcon name="vehicle" className="h-4 w-4 text-slate-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold">{appointment.vehicle.make} {appointment.vehicle.model}</p>
                    <p className="truncate text-[11px] text-slate-500">{appointment.service.name} · {appointment.appointmentTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: "UTC" })}</p>
                  </div>
                  <span className="max-w-20 rounded-full bg-blue-50 px-2 py-1 text-center text-[10px] font-semibold text-blue-700">{appointment.status.replaceAll("_", " ").toLowerCase()}</span>
                </div>
              ))}
            </div>
          ) : <p className="py-8 text-center text-xs text-slate-500">No appointments scheduled today.</p>
        }
        recentTitle="Recent Service Jobs"
        recentHref="/job-cards"
        recent={
          recentJobs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wide text-slate-400">
                  <tr><th className="pb-2 pr-3">Job</th><th className="pb-2 pr-3">Vehicle</th><th className="pb-2 pr-3">Customer</th><th className="pb-2 pr-3">Service</th><th className="pb-2">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentJobs.map((job) => (
                    <tr key={job.id}>
                      <td className="py-2.5 pr-3 font-semibold">#{job.id}</td>
                      <td className="py-2.5 pr-3">{job.appointment.vehicle.registrationNumber}</td>
                      <td className="py-2.5 pr-3">{job.appointment.customer.name}</td>
                      <td className="py-2.5 pr-3">{job.appointment.service.name}</td>
                      <td className="py-2.5"><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">{job.status.replaceAll("_", " ").toLowerCase()}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="py-8 text-center text-xs text-slate-500">No service jobs have been created.</p>
        }
        actions={[
          { label: "New Service Job", href: "/job-cards", icon: "job", tone: "blue" },
          { label: "Add Vehicle", href: "/vehicles", icon: "vehicle", tone: "green" },
          { label: "Add Customer", href: "/customers", icon: "customer", tone: "purple" },
          { label: "Create Invoice", href: "/invoices", icon: "invoice", tone: "amber" },
          { label: "Add Stock", href: "/spare-parts", icon: "parts", tone: "cyan" },
        ]}
      />
    </DashboardShell>
  );
}
