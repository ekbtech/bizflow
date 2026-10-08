"use client";

import { useEffect, useMemo, useState } from "react";

type Invoice = {
  id: number;
  totalAmount: number | string;
  status: string;
  createdAt: string;
  customer: { name: string; phone: string; email: string | null };
  vehicle: { registrationNumber: string; make: string; model: string };
  items: { itemType: string; itemName: string; quantity: number | string; unitPrice: number | string; discountAmount: number | string; lineTotal: number | string }[];
  payments: { amount: number | string; status: string }[];
};

const money = (value: number) => `KSh ${value.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function InvoiceManager() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/invoices", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result: { invoices?: Invoice[]; error?: string } = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Invoices could not be loaded.");
        if (active) setInvoices(result.invoices ?? []);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Invoices could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const visibleInvoices = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return invoices;
    return invoices.filter((invoice) =>
      [`INV-${invoice.id}`, invoice.customer.name, invoice.vehicle.registrationNumber, invoice.status]
        .some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [invoices, query]);

  function printInvoice(id: number) {
    document.body.classList.add("printing");
    document.querySelectorAll("[data-invoice-print]").forEach((element) => {
      element.classList.toggle("print-target", element.getAttribute("data-invoice-print") === String(id));
    });
    window.addEventListener("afterprint", () => {
      document.body.classList.remove("printing");
      document.querySelectorAll(".print-target").forEach((element) => element.classList.remove("print-target"));
    }, { once: true });
    window.print();
  }

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-black">Invoices ({invoices.length})</h2>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search invoice, customer, vehicle, or status" aria-label="Search invoices" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm sm:max-w-sm" />
      </div>
      <div className="space-y-4">
        {visibleInvoices.map((invoice) => {
          const paid = invoice.payments.filter((payment) => payment.status === "PAID").reduce((sum, payment) => sum + Number(payment.amount), 0);
          const balance = Math.max(0, Number(invoice.totalAmount) - paid);
          return (
            <article key={invoice.id} data-invoice-print={invoice.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-orange-600">Invoice INV-{invoice.id}</p>
                  <h3 className="mt-1 text-lg font-bold">{invoice.customer.name}</h3>
                  <p className="text-sm text-slate-600">{invoice.vehicle.make} {invoice.vehicle.model} · {invoice.vehicle.registrationNumber}</p>
                  <p className="text-sm text-slate-500">{new Date(invoice.createdAt).toLocaleDateString()} · {invoice.customer.phone}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${balance === 0 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{balance === 0 ? "PAID" : "PENDING"}</span>
                  <button type="button" onClick={() => printInvoice(invoice.id)} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold">Print / Save PDF</button>
                </div>
              </div>
              <div className="mt-4 border-t border-slate-200 pt-3">
                {invoice.items.map((item, index) => (
                  <div key={`${item.itemName}-${index}`} className="flex justify-between gap-4 py-1 text-sm">
                    <span>{item.itemName} <span className="text-slate-500">× {item.quantity}</span>{Number(item.discountAmount) > 0 && <span className="text-slate-500"> · discount {money(Number(item.discountAmount))}</span>}</span>
                    <span>{money(Number(item.lineTotal))}</span>
                  </div>
                ))}
                <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-bold">
                  <span>Total {money(Number(invoice.totalAmount))}</span>
                  <span>Balance {money(balance)}</span>
                </div>
                <p className="mt-1 text-right text-xs text-slate-500">Paid {money(paid)}</p>
              </div>
            </article>
          );
        })}
        {!loading && visibleInvoices.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No invoices match your search.</p>}
        {loading && <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading invoices…</p>}
      </div>
    </div>
  );
}
