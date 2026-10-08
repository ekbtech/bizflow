"use client";

import { useEffect, useState } from "react";

type Report = {
  period: { from: string; to: string };
  revenue: {
    totalInvoiced: number;
    paid: number;
    pending: number;
    paymentsReceived: number;
    expenses: number;
    netAfterExpenses: number;
  };
  operations: { deliveredJobs: number; averageRepairHours: number | null; repairDurationSampleSize: number };
  vehicles: { make: string; count: number }[];
  popularServices: { name: string; count: number }[];
  appointments: { status: string; count: number }[];
  monthlyRevenue: { month: string; amount: number }[];
  paymentsByMethod: { method: string; amount: number; count: number }[];
  expensesByCategory: { category: string; amount: number; count: number }[];
};

const money = (amount: number) => `KSh ${amount.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
const csvCell = (value: string | number) => {
  const text = String(value);
  const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};

export function ReportsDashboard({ initialFrom, initialTo }: { initialFrom: string; initialTo: string }) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadReport(start: string, end: string) {
    const response = await fetch(`/api/reports?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`, { credentials: "same-origin", cache: "no-store" });
    const result: Report & { error?: string } = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Reports could not be generated.");
    return result;
  }

  useEffect(() => {
    let active = true;
    loadReport(from, to)
      .then((result) => {
        if (active) setReport(result);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Reports could not be generated.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [from, to]);

  function exportCsv() {
    if (!report) return;
    const rows = [
      ["Report", `From ${report.period.from} to ${report.period.to}`],
      [],
      ["Revenue", "Amount"],
      ["Total invoiced", report.revenue.totalInvoiced],
      ["Paid", report.revenue.paid],
      ["Pending", report.revenue.pending],
      ["Payments received in period", report.revenue.paymentsReceived],
      ["Expenses in period", report.revenue.expenses],
      ["Net after expenses", report.revenue.netAfterExpenses],
      ["Delivered jobs", report.operations.deliveredJobs],
      ["Average repair hours", report.operations.averageRepairHours ?? "Not available"],
      [],
      ["Revenue month", "Payments received"],
      ...report.monthlyRevenue.map((month) => [month.month, month.amount]),
      [],
      ["Payment method", "Amount", "Payments"],
      ...report.paymentsByMethod.map((payment) => [payment.method, payment.amount, payment.count]),
      [],
      ["Expense category", "Amount", "Expenses"],
      ...report.expensesByCategory.map((expense) => [expense.category, expense.amount, expense.count]),
      [],
      ["Vehicle make", "Count"],
      ...report.vehicles.map((vehicle) => [vehicle.make, vehicle.count]),
      [],
      ["Popular service", "Completed jobs"],
      ...report.popularServices.map((service) => [service.name, service.count]),
      [],
      ["Appointment status", "Count"],
      ...report.appointments.map((appointment) => [appointment.status, appointment.count]),
    ];
    const content = rows.map((row) => row.map((cell) => csvCell(cell ?? "")).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bizflow-report-${report.period.from}-to-${report.period.to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const maxRevenue = Math.max(1, ...(report?.monthlyRevenue.map((entry) => entry.amount) ?? [1]));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-600">From<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-slate-900" /></label>
          <label className="text-sm font-medium text-slate-600">To<input type="date" value={to} min={from} max={initialTo} onChange={(event) => setTo(event.target.value)} className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-slate-900" /></label>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={!report} onClick={exportCsv} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Export CSV</button>
          <button type="button" onClick={() => window.print()} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Print / Save PDF</button>
        </div>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading && <p className="rounded-xl bg-white p-5 text-sm text-slate-500">Generating report…</p>}
      {report && <>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Total invoiced", money(report.revenue.totalInvoiced)],
            ["Paid against invoices", money(report.revenue.paid)],
            ["Outstanding", money(report.revenue.pending)],
            ["Payments received", money(report.revenue.paymentsReceived)],
            ["Expenses", money(report.revenue.expenses)],
            ["Net after expenses", money(report.revenue.netAfterExpenses)],
            ["Delivered jobs", report.operations.deliveredJobs.toLocaleString()],
            [
              "Average repair time",
              report.operations.averageRepairHours === null
                ? "Not available"
                : `${report.operations.averageRepairHours.toLocaleString("en-KE", { maximumFractionDigits: 1 })} hrs`,
            ],
          ].map(([label, value]) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></article>)}
        </section>
        <section className="grid gap-6 xl:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
            <h2 className="text-xl font-black">Revenue trend</h2>
            <div className="mt-5 flex min-h-52 items-end gap-3">
              {report.monthlyRevenue.map((item) => <div key={item.month} className="flex min-w-0 flex-1 flex-col items-center gap-2"><div title={money(item.amount)} className="w-full rounded-t-lg bg-orange-500" style={{ height: `${Math.max(4, (item.amount / maxRevenue) * 180)}px` }} /><span className="text-xs text-slate-500">{item.month}</span></div>)}
              {report.monthlyRevenue.length === 0 && <p className="self-center text-sm text-slate-500">No payments in this period.</p>}
            </div>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
            <h2 className="text-xl font-black">Appointments by status</h2>
            <div className="mt-4 space-y-3">{report.appointments.map((item) => <div key={item.status} className="flex justify-between border-b border-slate-100 pb-2 text-sm"><span>{item.status.toLowerCase()}</span><strong>{item.count}</strong></div>)}{report.appointments.length === 0 && <p className="text-sm text-slate-500">No appointments in this period.</p>}</div>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
            <h2 className="text-xl font-black">Payments by method</h2>
            <div className="mt-4 space-y-3">{report.paymentsByMethod.map((item) => <div key={item.method} className="flex justify-between border-b border-slate-100 pb-2 text-sm"><span>{item.method.replaceAll("_", " ")}</span><strong>{money(item.amount)} · {item.count}</strong></div>)}{report.paymentsByMethod.length === 0 && <p className="text-sm text-slate-500">No payments in this period.</p>}</div>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
            <h2 className="text-xl font-black">Expenses by category</h2>
            <div className="mt-4 space-y-3">{report.expensesByCategory.map((item) => <div key={item.category} className="flex justify-between border-b border-slate-100 pb-2 text-sm"><span>{item.category}</span><strong>{money(item.amount)} · {item.count}</strong></div>)}{report.expensesByCategory.length === 0 && <p className="text-sm text-slate-500">No expenses in this period.</p>}</div>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
            <h2 className="text-xl font-black">Vehicles by make</h2>
            <div className="mt-4 space-y-3">{report.vehicles.map((item) => <div key={item.make} className="flex justify-between border-b border-slate-100 pb-2 text-sm"><span>{item.make}</span><strong>{item.count}</strong></div>)}</div>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
            <h2 className="text-xl font-black">Most popular services</h2>
            <div className="mt-4 space-y-3">{report.popularServices.map((item) => <div key={item.name} className="flex justify-between border-b border-slate-100 pb-2 text-sm"><span>{item.name}</span><strong>{item.count}</strong></div>)}{report.popularServices.length === 0 && <p className="text-sm text-slate-500">No completed jobs in this period.</p>}</div>
          </article>
        </section>
      </>}
    </div>
  );
}
