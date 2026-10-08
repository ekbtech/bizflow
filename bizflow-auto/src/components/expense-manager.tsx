"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type Expense = {
  id: number;
  category: string;
  description: string;
  payee: string | null;
  amount: string | number;
  paymentMethod: string;
  reference: string | null;
  expenseDate: string;
  notes: string | null;
  createdBy: { name: string };
};
type ExpenseResponse = { expenses?: Expense[]; summary?: { total: number | string; monthly: number | string }; error?: string };

function money(value: number) {
  return `KSh ${value.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ExpenseManager({ todayDate }: { todayDate: string }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState({ total: 0, monthly: 0 });
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadExpenses() {
    const response = await fetch("/api/expenses", { credentials: "same-origin", cache: "no-store" });
    const result: ExpenseResponse = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Expenses could not be loaded.");
    setExpenses(result.expenses ?? []);
    setSummary({ total: Number(result.summary?.total ?? 0), monthly: Number(result.summary?.monthly ?? 0) });
  }

  useEffect(() => {
    let active = true;
    fetch("/api/expenses", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result: ExpenseResponse = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Expenses could not be loaded.");
        if (active) {
          setExpenses(result.expenses ?? []);
          setSummary({ total: Number(result.summary?.total ?? 0), monthly: Number(result.summary?.monthly ?? 0) });
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Expenses could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function recordExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/expenses", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: values.get("category"),
          description: values.get("description"),
          payee: values.get("payee"),
          amount: Number(values.get("amount")),
          paymentMethod: values.get("paymentMethod"),
          reference: values.get("reference"),
          expenseDate: values.get("expenseDate"),
          notes: values.get("notes"),
        }),
      });
      const result: ExpenseResponse = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Expense could not be recorded.");
      await loadExpenses();
      form.reset();
      setSuccess("Expense recorded.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Expense could not be recorded.");
    } finally {
      setSaving(false);
    }
  }

  const visibleExpenses = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return expenses;
    return expenses.filter((expense) => [
      expense.category,
      expense.description,
      expense.payee ?? "",
      expense.reference ?? "",
      expense.paymentMethod,
      expense.createdBy.name,
    ].some((value) => value.toLowerCase().includes(normalized)));
  }, [expenses, query]);
  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <p className="text-sm text-slate-500">Expenses this month</p>
          <p className="mt-2 text-2xl font-black">{money(summary.monthly)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <p className="text-sm text-slate-500">Total recorded expenses</p>
          <p className="mt-2 text-2xl font-black">{money(summary.total)}</p>
        </article>
      </section>

      <form onSubmit={(event) => void recordExpense(event)} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft sm:grid-cols-2 xl:grid-cols-3">
        <h2 className="text-xl font-black sm:col-span-2 xl:col-span-3">Record expense</h2>
        <input name="category" required minLength={2} maxLength={100} placeholder="Category (e.g. Utilities, Fuel, Rent)" className="rounded-xl border border-slate-200 px-3 py-2" />
        <input name="description" required minLength={3} maxLength={500} placeholder="Description" className="rounded-xl border border-slate-200 px-3 py-2" />
        <input name="payee" maxLength={255} placeholder="Payee / vendor" className="rounded-xl border border-slate-200 px-3 py-2" />
        <input name="amount" required type="number" min="0.01" max="9999999999.99" step="0.01" placeholder="Amount (KSh)" className="rounded-xl border border-slate-200 px-3 py-2" />
        <select name="paymentMethod" required defaultValue="CASH" className="rounded-xl border border-slate-200 px-3 py-2">
          <option value="CASH">Cash</option><option value="M_PESA">M-Pesa</option><option value="CARD">Card</option><option value="BANK">Bank</option>
        </select>
        <input name="expenseDate" required type="date" defaultValue={todayDate} className="rounded-xl border border-slate-200 px-3 py-2" />
        <input name="reference" maxLength={255} placeholder="Receipt / transaction reference" className="rounded-xl border border-slate-200 px-3 py-2 sm:col-span-2 xl:col-span-1" />
        <textarea name="notes" maxLength={5000} placeholder="Notes" className="min-h-12 rounded-xl border border-slate-200 px-3 py-2 sm:col-span-2" />
        <button disabled={saving} className="w-fit rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save expense"}
        </button>
      </form>

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-black">Expense history ({expenses.length})</h2>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search expenses" aria-label="Search expenses" className="rounded-xl border border-slate-200 px-3 py-2 text-sm sm:w-72" />
        </div>
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Category / description</th><th className="px-3 py-2">Payee</th><th className="px-3 py-2">Method / reference</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Recorded by</th></tr>
          </thead>
          <tbody>
            {visibleExpenses.map((expense) => (
              <tr key={expense.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-3 py-2">{new Date(expense.expenseDate).toLocaleDateString()}</td>
                <td className="px-3 py-2"><strong>{expense.category}</strong><br />{expense.description}</td>
                <td className="px-3 py-2">{expense.payee ?? "—"}</td>
                <td className="px-3 py-2">{expense.paymentMethod.replace("_", "-")}<br />{expense.reference ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 font-semibold">{money(Number(expense.amount))}</td>
                <td className="px-3 py-2">{expense.createdBy.name}</td>
              </tr>
            ))}
            {!loading && visibleExpenses.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">{expenses.length ? "No expenses match your search." : "No expenses have been recorded."}</td></tr>}
            {loading && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Loading expenses…</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
