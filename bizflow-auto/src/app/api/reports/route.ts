import { isDatabaseUnavailable, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function parseDate(value: string | null, endOfDay = false) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  const [year, month, day] = value.split("-").map(Number);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day
  ) return null;
  return date;
}

function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  const user = await requirePermission("reports:read");
  if (user instanceof Response) return user;

  const url = new URL(request.url);
  const fromValue = url.searchParams.get("from");
  const toValue = url.searchParams.get("to");
  const startDate = parseDate(fromValue) ?? (fromValue ? null : new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const endDate = parseDate(toValue, true) ?? (toValue ? null : new Date());
  if (!startDate || !endDate) return Response.json({ error: "Use valid dates in YYYY-MM-DD format." }, { status: 400 });
  if (startDate > endDate) return Response.json({ error: "The start date must be on or before the end date." }, { status: 400 });

  try {
    const [
      invoiceSummary,
      paidAgainstInvoiceSummary,
      vehicles,
      completedJobs,
      completedJobCount,
      appointmentCounts,
      paymentRecords,
      paymentSummary,
      paymentsByMethod,
      expenseRecords,
      expensesByCategory,
    ] = await Promise.all([
      prisma.invoice.aggregate({
        where: { createdAt: { gte: startDate, lte: endDate } },
        _sum: { totalAmount: true },
      }),
      prisma.payment.aggregate({
        where: {
          status: "PAID",
          invoice: { createdAt: { gte: startDate, lte: endDate } },
        },
        _sum: { amount: true },
      }),
      prisma.vehicle.groupBy({
        by: ["make"],
        _count: { _all: true },
        orderBy: { _count: { make: "desc" } },
      }),
      prisma.jobCard.findMany({
        where: { status: "DELIVERED", deliveredAt: { gte: startDate, lte: endDate } },
        select: {
          startedAt: true,
          workCompletedAt: true,
          appointment: { select: { service: { select: { name: true } } } },
        },
      }),
      prisma.jobCard.count({
        where: { status: "DELIVERED", deliveredAt: { gte: startDate, lte: endDate } },
      }),
      prisma.appointment.groupBy({
        by: ["status"],
        where: { appointmentDate: { gte: startDate, lte: endDate } },
        _count: { _all: true },
      }),
      prisma.payment.findMany({
        where: { paymentDate: { gte: startDate, lte: endDate }, status: "PAID" },
        select: { amount: true, paymentDate: true },
      }),
      prisma.payment.aggregate({
        where: { paymentDate: { gte: startDate, lte: endDate }, status: "PAID" },
        _sum: { amount: true },
      }),
      prisma.payment.groupBy({
        by: ["paymentMethod"],
        where: { paymentDate: { gte: startDate, lte: endDate }, status: "PAID" },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.expense.aggregate({
        where: { expenseDate: { gte: startDate, lte: endDate } },
        _sum: { amount: true },
      }),
      prisma.expense.groupBy({
        by: ["category"],
        where: { expenseDate: { gte: startDate, lte: endDate } },
        _sum: { amount: true },
        _count: { _all: true },
        orderBy: { _sum: { amount: "desc" } },
      }),
    ]);

    const invoicedAmount = Number(invoiceSummary._sum.totalAmount ?? 0);
    const paidAgainstInvoices = Number(paidAgainstInvoiceSummary._sum.amount ?? 0);
    const services = new Map<string, number>();
    const repairDurations: number[] = [];
    for (const job of completedJobs) {
      const name = job.appointment.service.name;
      services.set(name, (services.get(name) ?? 0) + 1);
      if (job.startedAt && job.workCompletedAt && job.workCompletedAt >= job.startedAt) {
        repairDurations.push((job.workCompletedAt.getTime() - job.startedAt.getTime()) / (60 * 60 * 1000));
      }
    }
    const monthlyRevenue = new Map<string, number>();
    for (const payment of paymentRecords) {
      const key = `${payment.paymentDate.getFullYear()}-${String(payment.paymentDate.getMonth() + 1).padStart(2, "0")}`;
      monthlyRevenue.set(key, (monthlyRevenue.get(key) ?? 0) + Number(payment.amount));
    }

    const monthCursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    const monthlyRevenueSeries: { month: string; amount: number }[] = [];
    while (monthCursor <= endMonth) {
      const month = `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, "0")}`;
      monthlyRevenueSeries.push({ month, amount: monthlyRevenue.get(month) ?? 0 });
      monthCursor.setMonth(monthCursor.getMonth() + 1);
    }

    const paymentsReceived = Number(paymentSummary._sum.amount ?? 0);
    const expensesInPeriod = Number(expenseRecords._sum.amount ?? 0);
    return Response.json({
      period: { from: formatLocalDate(startDate), to: formatLocalDate(endDate) },
      revenue: {
        totalInvoiced: invoicedAmount,
        paid: paidAgainstInvoices,
        pending: Math.max(0, invoicedAmount - paidAgainstInvoices),
        paymentsReceived,
        expenses: expensesInPeriod,
        netAfterExpenses: paymentsReceived - expensesInPeriod,
      },
      operations: {
        deliveredJobs: completedJobCount,
        averageRepairHours: repairDurations.length
          ? repairDurations.reduce((sum, duration) => sum + duration, 0) / repairDurations.length
          : null,
        repairDurationSampleSize: repairDurations.length,
      },
      vehicles: vehicles.map((vehicle) => ({ make: vehicle.make, count: vehicle._count._all })),
      popularServices: [...services.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      appointments: appointmentCounts.map((item) => ({ status: item.status, count: item._count._all })),
      monthlyRevenue: monthlyRevenueSeries,
      paymentsByMethod: paymentsByMethod.map((item) => ({
        method: item.paymentMethod,
        amount: Number(item._sum.amount ?? 0),
        count: item._count._all,
      })),
      expensesByCategory: expensesByCategory.map((item) => ({
        category: item.category,
        amount: Number(item._sum.amount ?? 0),
        count: item._count._all,
      })),
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) return Response.json({ error: "The database is unavailable." }, { status: 503 });
    console.error("Report query failed.", error);
    return Response.json({ error: "Reports could not be generated." }, { status: 500 });
  }
}
