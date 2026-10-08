import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  DashboardOverview,
  DashboardTrendChart,
  type DashboardAction,
  type DashboardMetric,
  type DashboardSeries,
} from "@/components/dashboard-overview";
import { ModuleIcon } from "@/components/module-icon";
import { DEFAULT_REORDER_LEVEL } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/lib/auth";

type StaffDashboardRole = Extract<UserRole, "SERVICE_ADVISOR" | "MECHANIC" | "STOREKEEPER" | "ACCOUNTANT">;

const currency = (amount: number) =>
  `KSh ${amount.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

function createDays(today: Date) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() - 6 + index);
    return date;
  });
}

function dayMatches(value: Date, target: Date) {
  return value.getFullYear() === target.getFullYear() &&
    value.getMonth() === target.getMonth() &&
    value.getDate() === target.getDate();
}

function chartLabels(days: Date[]) {
  return days.map((day) => day.toLocaleDateString("en-KE", { day: "numeric", month: "short" }));
}

function StatusPill({ value }: { value: string }) {
  const tone =
    value === "COMPLETED" || value === "RECEIVED" || value === "PAID"
      ? "bg-emerald-100 text-emerald-700"
      : value === "OVERDUE" || value === "CANCELLED" || value === "FAILED"
        ? "bg-red-100 text-red-700"
        : "bg-amber-100 text-amber-800";

  return <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${tone}`}>{value.replaceAll("_", " ").toLowerCase()}</span>;
}

function ItemRows({ items }: { items: { title: string; detail: string; status?: string; href?: string }[] }) {
  if (items.length === 0) return <p className="py-8 text-center text-xs text-slate-500">Nothing to show right now.</p>;

  return (
    <div className="divide-y divide-slate-100">
      {items.map((item, index) => {
        const content = (
          <>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
              <ModuleIcon name={item.status ? "job" : "vehicle"} className="h-4 w-4 text-slate-600" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-slate-800">{item.title}</span>
              <span className="block truncate text-[11px] text-slate-500">{item.detail}</span>
            </span>
            {item.status && <StatusPill value={item.status} />}
          </>
        );

        return item.href ? (
          <Link key={`${item.title}-${index}`} href={item.href} className="flex items-center gap-2 py-2.5 first:pt-0 last:pb-0">
            {content}
          </Link>
        ) : (
          <div key={`${item.title}-${index}`} className="flex items-center gap-2 py-2.5 first:pt-0 last:pb-0">
            {content}
          </div>
        );
      })}
    </div>
  );
}

function WorkTable({
  rows,
  headings = ["Job", "Vehicle", "Customer", "Service", "Status"],
}: {
  rows: { id: string; vehicle: string; customer: string; service: string; status: string }[];
  headings?: [string, string, string, string, string];
}) {
  if (rows.length === 0) return <p className="py-8 text-center text-xs text-slate-500">No recent work to show.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-xs">
        <thead className="text-[10px] uppercase tracking-wide text-slate-400">
          <tr>{headings.map((heading) => <th key={heading} className="pb-2 pr-3">{heading}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="py-2.5 pr-3 font-semibold">{row.id}</td>
              <td className="py-2.5 pr-3">{row.vehicle}</td>
              <td className="py-2.5 pr-3">{row.customer}</td>
              <td className="py-2.5 pr-3">{row.service}</td>
              <td className="py-2.5"><StatusPill value={row.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoleDashboard({
  title,
  metrics,
  chartTitle,
  chartIcon,
  labels,
  series,
  scheduleTitle,
  scheduleHref,
  scheduleItems,
  recentTitle,
  recentHref,
  recentRows,
  recentHeadings,
  actions,
}: {
  title: string;
  metrics: DashboardMetric[];
  chartTitle: string;
  chartIcon: "appointment" | "report" | "parts" | "job";
  labels: string[];
  series: DashboardSeries[];
  scheduleTitle: string;
  scheduleHref: string;
  scheduleItems: { title: string; detail: string; status?: string; href?: string }[];
  recentTitle: string;
  recentHref: string;
  recentRows: { id: string; vehicle: string; customer: string; service: string; status: string }[];
  recentHeadings?: [string, string, string, string, string];
  actions: DashboardAction[];
}) {
  return (
    <DashboardShell
      title="Dashboard"
      subtitle={`Here’s what’s happening in your ${title.toLowerCase()} today.`}
      active="Dashboard"
      actions={
        <div className="flex flex-wrap gap-2">
          {actions.slice(0, 3).map((action, index) => (
            <Link
              key={`header-${action.label}`}
              href={action.href}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold ${
                index === 0
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <ModuleIcon name={action.icon} />
              {action.label}
            </Link>
          ))}
        </div>
      }
    >
      <DashboardOverview
        metrics={metrics}
        chartTitle={chartTitle}
        chartIcon={chartIcon}
        chart={<DashboardTrendChart labels={labels} series={series} />}
        scheduleTitle={scheduleTitle}
        scheduleHref={scheduleHref}
        schedule={<ItemRows items={scheduleItems} />}
        recentTitle={recentTitle}
        recentHref={recentHref}
        recent={<WorkTable rows={recentRows.slice(0, 5)} headings={recentHeadings} />}
        actions={actions}
      />
    </DashboardShell>
  );
}

export async function StaffRoleDashboard({
  role,
  userId,
}: {
  role: StaffDashboardRole;
  userId: number;
}) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const days = createDays(today);
  const weekStart = days[0];

  if (role === "SERVICE_ADVISOR") {
    const [todayBookings, checkedIn, newCustomers, pendingRequests, activeJobs, todaysAppointments, recentAppointments, weekAppointments] = await Promise.all([
      prisma.appointment.count({ where: { appointmentDate: { gte: today, lt: tomorrow } } }),
      prisma.appointment.count({ where: { status: { in: ["CHECKED_IN", "IN_SERVICE"] } } }),
      prisma.customer.count({ where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } } }),
      prisma.appointment.count({ where: { status: "REQUESTED" } }),
      prisma.jobCard.count({ where: { status: { in: ["WAITING", "INSPECTION", "DIAGNOSIS", "AWAITING_APPROVAL", "IN_PROGRESS", "QUALITY_CHECK"] } } }),
      prisma.appointment.findMany({
        where: { appointmentDate: { gte: today, lt: tomorrow } },
        orderBy: { appointmentTime: "asc" },
        take: 6,
        include: { customer: { select: { name: true } }, vehicle: { select: { make: true, model: true, registrationNumber: true } }, service: { select: { name: true } } },
      }),
      prisma.appointment.findMany({
        orderBy: [{ appointmentDate: "desc" }, { appointmentTime: "desc" }],
        take: 5,
        include: { customer: { select: { name: true } }, vehicle: { select: { registrationNumber: true } }, service: { select: { name: true } }, jobCard: { select: { id: true, status: true, mechanic: { select: { name: true } } } } },
      }),
      prisma.appointment.findMany({
        where: { appointmentDate: { gte: weekStart, lt: tomorrow } },
        select: { appointmentDate: true, status: true },
      }),
    ]);
    const series: DashboardSeries[] = [
      { label: "Appointments", color: "#3b82f6", values: days.map((day) => weekAppointments.filter((item) => dayMatches(item.appointmentDate, day)).length), kind: "bar" },
      { label: "Completed", color: "#10b981", values: days.map((day) => weekAppointments.filter((item) => dayMatches(item.appointmentDate, day) && item.status === "COMPLETED").length), kind: "line" },
      { label: "Waiting", color: "#f59e0b", values: days.map((day) => weekAppointments.filter((item) => dayMatches(item.appointmentDate, day) && item.status === "REQUESTED").length), kind: "line" },
    ];
    return (
      <RoleDashboard title="Service Advisor" labels={chartLabels(days)} chartTitle="Appointment Overview" chartIcon="appointment" series={series}
        metrics={[
          { label: "Today's Appointments", icon: "appointment", value: todayBookings.toLocaleString() },
          { label: "Vehicles In Garage", icon: "vehicle", value: checkedIn.toLocaleString() },
          { label: "New Customers", icon: "customer", value: newCustomers.toLocaleString() },
          { label: "Pending Requests", icon: "reception", value: pendingRequests.toLocaleString() },
          { label: "Active Jobs", icon: "job", value: activeJobs.toLocaleString() },
        ]}
        scheduleTitle="Today's Appointments" scheduleHref="/appointments"
        scheduleItems={todaysAppointments.map((appointment) => ({ title: `${appointment.vehicle.make} ${appointment.vehicle.model}`, detail: `${appointment.service.name} · ${appointment.appointmentTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: "UTC" })}`, status: appointment.status }))}
        recentTitle="Recent Service Jobs" recentHref="/job-cards"
        recentRows={recentAppointments.map((appointment) => ({ id: `#${appointment.jobCard?.id ?? appointment.id}`, vehicle: appointment.vehicle.registrationNumber, customer: appointment.customer.name, service: appointment.service.name, status: appointment.jobCard?.status ?? appointment.status }))}
        actions={[
          { label: "New Appointment", href: "/appointments", icon: "appointment", tone: "blue" },
          { label: "Vehicle Intake", href: "/receptions", icon: "reception", tone: "green" },
          { label: "Add Customer", href: "/customers", icon: "customer", tone: "purple" },
          { label: "Create Quotation", href: "/quotations", icon: "quote", tone: "amber" },
          { label: "Open Job Cards", href: "/job-cards", icon: "job", tone: "cyan" },
        ]}
      />
    );
  }

  if (role === "MECHANIC") {
    const mechanic = await prisma.mechanic.findUnique({ where: { userId }, select: { id: true } });
    if (!mechanic) {
      return (
        <DashboardShell title="Dashboard" subtitle="Mechanic dashboard" active="Dashboard">
          <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Your mechanic profile is not linked yet. Contact the garage administrator to access assigned jobs.
          </p>
        </DashboardShell>
      );
    }
    const activeStatuses = ["WAITING", "INSPECTION", "DIAGNOSIS", "AWAITING_APPROVAL", "IN_PROGRESS", "QUALITY_CHECK"] as const;
    const [activeJobs, waitingJobs, inProgressJobs, qualityJobs, completedToday, jobs, history, weekJobs] = await Promise.all([
      prisma.jobCard.count({ where: { mechanicId: mechanic.id, status: { in: [...activeStatuses] } } }),
      prisma.jobCard.count({ where: { mechanicId: mechanic.id, status: "WAITING" } }),
      prisma.jobCard.count({ where: { mechanicId: mechanic.id, status: "IN_PROGRESS" } }),
      prisma.jobCard.count({ where: { mechanicId: mechanic.id, status: "QUALITY_CHECK" } }),
      prisma.jobCard.count({ where: { mechanicId: mechanic.id, status: "COMPLETED", completedAt: { gte: today, lt: tomorrow } } }),
      prisma.jobCard.findMany({
        where: { mechanicId: mechanic.id, status: { in: [...activeStatuses] } },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          appointment: {
            include: {
              customer: { select: { name: true } },
              vehicle: { select: { registrationNumber: true, make: true, model: true } },
              service: { select: { name: true } },
            },
          },
        },
      }),
      prisma.jobCard.findMany({
        where: { mechanicId: mechanic.id, status: { in: ["COMPLETED", "DELIVERED"] } },
        orderBy: { completedAt: "desc" },
        take: 5,
        include: {
          appointment: {
            include: {
              customer: { select: { name: true } },
              vehicle: { select: { registrationNumber: true } },
              service: { select: { name: true } },
            },
          },
        },
      }),
      prisma.jobCard.findMany({
        where: { mechanicId: mechanic.id, createdAt: { gte: weekStart, lt: tomorrow } },
        select: { createdAt: true, status: true },
      }),
    ]);
    const series: DashboardSeries[] = [
      { label: "Assigned", color: "#3b82f6", values: days.map((day) => weekJobs.filter((job) => dayMatches(job.createdAt, day)).length), kind: "bar" },
      { label: "In Progress", color: "#10b981", values: days.map((day) => weekJobs.filter((job) => dayMatches(job.createdAt, day) && job.status === "IN_PROGRESS").length), kind: "line" },
      { label: "Waiting", color: "#f59e0b", values: days.map((day) => weekJobs.filter((job) => dayMatches(job.createdAt, day) && job.status === "WAITING").length), kind: "line" },
    ];
    return (
      <RoleDashboard title="Mechanic" labels={chartLabels(days)} chartTitle="Job Progress" chartIcon="job" series={series}
        metrics={[
          { label: "Active Jobs", icon: "job", value: activeJobs.toLocaleString() },
          { label: "In Progress", icon: "inspection", value: inProgressJobs.toLocaleString() },
          { label: "Waiting", icon: "appointment", value: waitingJobs.toLocaleString() },
          { label: "Completed Today", icon: "service", value: completedToday.toLocaleString() },
          { label: "Quality Check", icon: "inspection", value: qualityJobs.toLocaleString() },
        ]}
        scheduleTitle="My Active Jobs" scheduleHref="/mechanic/dashboard"
        scheduleItems={jobs.slice(0, 6).map((job) => ({ title: `${job.appointment.vehicle.make} ${job.appointment.vehicle.model}`, detail: `${job.appointment.service.name} · ${job.appointment.customer.name}`, status: job.status, href: "/mechanic/dashboard" }))}
        recentTitle="Completed Jobs" recentHref="/mechanic/dashboard"
        recentRows={history.map((job) => ({ id: `#${job.id}`, vehicle: job.appointment.vehicle.registrationNumber, customer: job.appointment.customer.name, service: job.appointment.service.name, status: job.status }))}
        actions={[
          { label: "My Assigned Jobs", href: "/mechanic/dashboard", icon: "job", tone: "blue" },
          { label: "Inspections", href: "/inspections", icon: "inspection", tone: "green" },
          { label: "Spare Parts", href: "/spare-parts", icon: "parts", tone: "purple" },
          { label: "My Leave", href: "/leave", icon: "leave", tone: "amber" },
          { label: "Update Job Status", href: "/mechanic/dashboard", icon: "service", tone: "cyan" },
        ]}
      />
    );
  }

  if (role === "ACCOUNTANT") {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [monthPayments, todayPayments, outstanding, monthExpenses, recentInvoices, payments, expenses] = await Promise.all([
      prisma.payment.aggregate({ where: { status: "PAID", paymentDate: { gte: monthStart } }, _sum: { amount: true } }),
      prisma.payment.aggregate({ where: { status: "PAID", paymentDate: { gte: today, lt: tomorrow } }, _sum: { amount: true } }),
      prisma.invoice.aggregate({ where: { status: { in: ["PENDING", "OVERDUE"] } }, _sum: { totalAmount: true }, _count: { _all: true } }),
      prisma.expense.aggregate({ where: { expenseDate: { gte: monthStart } }, _sum: { amount: true } }),
      prisma.invoice.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { customer: { select: { name: true } }, vehicle: { select: { registrationNumber: true } } },
      }),
      prisma.payment.findMany({
        where: { status: "PAID", paymentDate: { gte: weekStart, lt: tomorrow } },
        select: {
          amount: true,
          paymentDate: true,
          transactionReference: true,
          invoice: { select: { customer: { select: { name: true } }, vehicle: { select: { registrationNumber: true } } } },
        },
      }),
      prisma.expense.findMany({ where: { expenseDate: { gte: weekStart, lt: tomorrow } }, select: { amount: true, expenseDate: true } }),
    ]);
    const series: DashboardSeries[] = [
      { label: "Revenue", color: "#3b82f6", values: days.map((day) => payments.filter((payment) => dayMatches(payment.paymentDate, day)).reduce((sum, payment) => sum + Number(payment.amount), 0)), kind: "bar" },
      { label: "Expenses", color: "#ec4899", values: days.map((day) => expenses.filter((expense) => dayMatches(expense.expenseDate, day)).reduce((sum, expense) => sum + Number(expense.amount), 0)), kind: "line" },
    ];
    return (
      <RoleDashboard title="Accountant" labels={chartLabels(days)} chartTitle="Revenue Overview" chartIcon="report" series={series}
        metrics={[
          { label: "Revenue This Month", icon: "payment", value: currency(Number(monthPayments._sum.amount ?? 0)) },
          { label: "Today's Revenue", icon: "payment", value: currency(Number(todayPayments._sum.amount ?? 0)) },
          { label: "Outstanding", icon: "invoice", value: currency(Number(outstanding._sum.totalAmount ?? 0)) },
          { label: "Expenses This Month", icon: "expense", value: currency(Number(monthExpenses._sum.amount ?? 0)) },
          { label: "Invoices Due", icon: "invoice", value: outstanding._count._all.toLocaleString() },
        ]}
        scheduleTitle="Recent Invoices" scheduleHref="/invoices"
        scheduleItems={recentInvoices.slice(0, 6).map((invoice) => ({ title: `${invoice.customer.name} · ${invoice.vehicle.registrationNumber}`, detail: `INV-${invoice.id} · ${currency(Number(invoice.totalAmount))}`, status: invoice.status }))}
        recentTitle="Recent Payments" recentHref="/payments"
        recentHeadings={["Reference", "Vehicle", "Customer", "Amount", "Status"]}
        recentRows={payments.slice(0, 5).map((payment, index) => ({ id: payment.transactionReference ?? `#${index + 1}`, vehicle: payment.invoice.vehicle.registrationNumber, customer: payment.invoice.customer.name, service: currency(Number(payment.amount)), status: "PAID" }))}
        actions={[
          { label: "Create Invoice", href: "/invoices", icon: "invoice", tone: "blue" },
          { label: "Record Payment", href: "/payments", icon: "payment", tone: "green" },
          { label: "Record Expense", href: "/expenses", icon: "expense", tone: "purple" },
          { label: "Financial Reports", href: "/reports", icon: "report", tone: "amber" },
          { label: "Review Invoices", href: "/invoices", icon: "invoice", tone: "cyan" },
        ]}
      />
    );
  }

  const [totalParts, trackedParts, lowStockCount, lowStockParts, openOrders, transactions, weekTransactions] = await Promise.all([
    prisma.sparePart.count(),
    prisma.sparePart.count({ where: { stockCounted: true } }),
    prisma.sparePart.count({
      where: {
        stockCounted: true,
        OR: [
          { reorderLevel: 0, quantity: { lte: DEFAULT_REORDER_LEVEL } },
          { reorderLevel: { gt: 0 }, quantity: { lte: prisma.sparePart.fields.reorderLevel } },
        ],
      },
    }),
    prisma.sparePart.findMany({
      where: {
        stockCounted: true,
        OR: [
          { reorderLevel: 0, quantity: { lte: DEFAULT_REORDER_LEVEL } },
          { reorderLevel: { gt: 0 }, quantity: { lte: prisma.sparePart.fields.reorderLevel } },
        ],
      },
      orderBy: { quantity: "asc" },
      take: 8,
      select: { id: true, name: true, quantity: true, reorderLevel: true },
    }),
    prisma.purchaseOrder.count({ where: { status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] } } }),
    prisma.inventoryTransaction.count({ where: { createdAt: { gte: today, lt: tomorrow } } }),
    prisma.inventoryTransaction.findMany({ where: { createdAt: { gte: weekStart, lt: tomorrow } }, select: { createdAt: true, transactionType: true } }),
  ]);
  const series: DashboardSeries[] = [
    { label: "Movements", color: "#3b82f6", values: days.map((day) => weekTransactions.filter((item) => dayMatches(item.createdAt, day)).length), kind: "bar" },
    { label: "Stock In", color: "#10b981", values: days.map((day) => weekTransactions.filter((item) => dayMatches(item.createdAt, day) && ["IN", "ADJUSTMENT_IN"].includes(item.transactionType)).length), kind: "line" },
    { label: "Stock Out", color: "#f59e0b", values: days.map((day) => weekTransactions.filter((item) => dayMatches(item.createdAt, day) && ["OUT", "ADJUSTMENT_OUT"].includes(item.transactionType)).length), kind: "line" },
  ];
  return (
    <RoleDashboard title="Storekeeper" labels={chartLabels(days)} chartTitle="Stock Movement" chartIcon="parts" series={series}
      metrics={[
        { label: "Parts Catalog", icon: "parts", value: totalParts.toLocaleString() },
        { label: "Tracked Stock", icon: "parts", value: trackedParts.toLocaleString() },
        { label: "Low Stock", icon: "inspection", value: lowStockCount.toLocaleString() },
        { label: "Open Orders", icon: "procurement", value: openOrders.toLocaleString() },
        { label: "Today's Movements", icon: "parts", value: transactions.toLocaleString() },
      ]}
      scheduleTitle="Low Stock Items" scheduleHref="/spare-parts"
      scheduleItems={lowStockParts.slice(0, 6).map((part) => ({ title: part.name, detail: `${part.quantity} remaining · reorder at ${part.reorderLevel || DEFAULT_REORDER_LEVEL}`, status: "LOW STOCK", href: "/spare-parts" }))}
      recentTitle="Recent Stock Activity" recentHref="/spare-parts"
      recentHeadings={["Movement", "Date", "Record", "Type", "Status"]}
      recentRows={weekTransactions.slice(0, 8).map((transaction, index) => ({ id: `#${index + 1}`, vehicle: transaction.createdAt.toLocaleDateString("en-KE"), customer: "Stock", service: transaction.transactionType.replaceAll("_", " ").toLowerCase(), status: transaction.transactionType }))}
      actions={[
        { label: "Inventory", href: "/spare-parts", icon: "parts", tone: "blue" },
        { label: "Record Stock Movement", href: "/spare-parts", icon: "procurement", tone: "green" },
        { label: "Purchase Orders", href: "/procurement", icon: "procurement", tone: "purple" },
        { label: "Low Stock Items", href: "/spare-parts", icon: "inspection", tone: "amber" },
        { label: "Apply for Leave", href: "/leave", icon: "leave", tone: "cyan" },
      ]}
    />
  );
}
