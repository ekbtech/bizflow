"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

type InvoiceOption = {
  id: number;
  totalAmount: number | string;
  customer: { id: number; name: string };
  payments: { amount: number | string; status: string }[];
};
type Payment = {
  id: number;
  amount: number | string;
  paymentMethod: string;
  transactionReference: string | null;
  paymentDate: string;
  status: string;
  invoice: { id: number; totalAmount: number | string; customer: { name: string } };
  receipt: { id: number; receiptNumber: string } | null;
};

const money = (value: number) => `KSh ${value.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PaymentManager() {
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function fetchData() {
    const [invoiceResponse, paymentResponse] = await Promise.all([
      fetch("/api/invoices", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/payments", { credentials: "same-origin", cache: "no-store" }),
    ]);
    const [invoiceResult, paymentResult]: [
      { invoices?: InvoiceOption[]; error?: string },
      { payments?: Payment[]; error?: string },
    ] = await Promise.all([invoiceResponse.json(), paymentResponse.json()]);
    if (!invoiceResponse.ok) throw new Error(invoiceResult.error ?? "Invoices could not be loaded.");
    if (!paymentResponse.ok) throw new Error(paymentResult.error ?? "Payments could not be loaded.");
    return { invoices: invoiceResult.invoices ?? [], payments: paymentResult.payments ?? [] };
  }

  useEffect(() => {
    let active = true;
    fetchData()
      .then((data) => {
        if (active) {
          setInvoices(data.invoices);
          setPayments(data.payments);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Payments could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: Number(values.invoiceId),
          amount: Number(values.amount),
          paymentMethod: values.paymentMethod,
          transactionReference: values.transactionReference,
        }),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Payment could not be recorded.");
      form.reset();
      setSuccess("Payment recorded and invoice balance updated.");
      const data = await fetchData();
      setInvoices(data.invoices);
      setPayments(data.payments);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment could not be recorded.");
    } finally {
      setSaving(false);
    }
  }

  const outstandingInvoices = invoices.filter((invoice) => {
    const paid = invoice.payments.filter((payment) => payment.status === "PAID").reduce((sum, payment) => sum + Number(payment.amount), 0);
    return Number(invoice.totalAmount) > paid;
  });
  const customerBalances = [...invoices.reduce((balances, invoice) => {
    const paid = invoice.payments.filter((payment) => payment.status === "PAID").reduce((sum, payment) => sum + Number(payment.amount), 0);
    const balance = Math.max(0, Number(invoice.totalAmount) - paid);
    const previous = balances.get(invoice.customer.id) ?? { customerId: invoice.customer.id, name: invoice.customer.name, invoiced: 0, paid: 0, balance: 0, invoiceCount: 0 };
    previous.invoiced += Number(invoice.totalAmount);
    previous.paid += paid;
    previous.balance += balance;
    previous.invoiceCount += 1;
    balances.set(invoice.customer.id, previous);
    return balances;
  }, new Map<number, { customerId: number; name: string; invoiced: number; paid: number; balance: number; invoiceCount: number }>()).values()]
    .filter((balance) => balance.balance > 0)
    .sort((left, right) => right.balance - left.balance);
  const totalReceivables = customerBalances.reduce((sum, balance) => sum + balance.balance, 0);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-black">Customer balances</h2>
          <p className="text-sm font-bold">Total receivables: {money(totalReceivables)}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Invoices</th><th className="px-3 py-2">Invoiced</th><th className="px-3 py-2">Paid</th><th className="px-3 py-2">Outstanding</th></tr>
            </thead>
            <tbody>
              {customerBalances.map((balance) => (
                <tr key={balance.customerId} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{balance.name}</td>
                  <td className="px-3 py-2">{balance.invoiceCount}</td>
                  <td className="px-3 py-2">{money(balance.invoiced)}</td>
                  <td className="px-3 py-2">{money(balance.paid)}</td>
                  <td className="px-3 py-2 font-bold text-amber-800">{money(balance.balance)}</td>
                </tr>
              ))}
              {customerBalances.length === 0 && <tr><td colSpan={5} className="px-3 py-5 text-slate-500">No customer balances are outstanding.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <form onSubmit={(event) => void recordPayment(event)} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft md:grid-cols-2">
        <h2 className="text-lg font-bold md:col-span-2">Record payment</h2>
        <select name="invoiceId" required defaultValue="" className="rounded-xl border border-slate-200 px-3 py-2">
          <option value="" disabled>Select invoice</option>
          {outstandingInvoices.map((invoice) => {
            const paid = invoice.payments.filter((payment) => payment.status === "PAID").reduce((sum, payment) => sum + Number(payment.amount), 0);
            return <option key={invoice.id} value={invoice.id}>INV-{invoice.id} · {invoice.customer.name} · balance {money(Number(invoice.totalAmount) - paid)}</option>;
          })}
        </select>
        <input name="amount" required type="number" min="0.01" step="0.01" placeholder="Amount (KSh)" className="rounded-xl border border-slate-200 px-3 py-2" />
        <select name="paymentMethod" required defaultValue="CASH" className="rounded-xl border border-slate-200 px-3 py-2">
          <option value="CASH">Cash</option><option value="M_PESA">M-Pesa (manual)</option><option value="CARD">Card</option><option value="BANK">Bank</option>
        </select>
        <input name="transactionReference" maxLength={255} placeholder="Reference (optional)" className="rounded-xl border border-slate-200 px-3 py-2" />
        <button disabled={saving || outstandingInvoices.length === 0} className="w-fit rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? "Recording…" : outstandingInvoices.length ? "Record payment" : "No outstanding invoices"}
        </button>
      </form>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr><th className="px-5 py-3">Invoice</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Method</th><th className="px-5 py-3">Reference</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Receipt</th></tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} className="border-t border-slate-200">
                <td className="px-5 py-3 font-semibold">INV-{payment.invoice.id}</td>
                <td className="px-5 py-3">{payment.invoice.customer.name}</td>
                <td className="px-5 py-3">{money(Number(payment.amount))}</td>
                <td className="px-5 py-3">{payment.paymentMethod.replace("_", "-")}</td>
                <td className="px-5 py-3">{payment.transactionReference ?? "—"}</td>
                <td className="px-5 py-3">{new Date(payment.paymentDate).toLocaleDateString()}</td>
                <td className="px-5 py-3">{payment.status}</td>
                <td className="px-5 py-3">{payment.receipt ? <Link href={`/receipts/${payment.receipt.id}`} className="font-semibold text-orange-700">{payment.receipt.receiptNumber}</Link> : "—"}</td>
              </tr>
            ))}
            {!loading && payments.length === 0 && <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-500">No payments recorded.</td></tr>}
            {loading && <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-500">Loading payments…</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
