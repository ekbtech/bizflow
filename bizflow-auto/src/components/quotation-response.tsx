"use client";

import { useEffect, useState } from "react";

type Quotation = {
  id: number;
  status: string;
  totalAmount: string | number;
  notes: string | null;
  expiresAt: string;
  items: {
    itemType: string;
    description: string;
    quantity: string | number;
    unitPrice: string | number;
    discountAmount: string | number;
    lineTotal: string | number;
  }[];
  appointment: {
    customer: { name: string };
    vehicle: { registrationNumber: string; make: string; model: string };
    service: { name: string };
  };
};
type ResponseData = { quotation?: Quotation; error?: string };

function money(value: string | number) {
  return `KSh ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function QuotationResponse({ token }: { token: string }) {
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/quote-response?token=${encodeURIComponent(token)}`, { cache: "no-store", referrerPolicy: "no-referrer" })
      .then(async (response) => {
        const result: ResponseData = await response.json();
        if (!response.ok || !result.quotation) throw new Error(result.error ?? "This quotation link is invalid or expired.");
        if (active) setQuotation(result.quotation);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "This quotation link is invalid or expired.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function decide(decision: "APPROVE" | "REJECT") {
    if (!window.confirm(`Confirm that you want to ${decision.toLowerCase()} this quotation?`)) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/quote-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, decision }),
        referrerPolicy: "no-referrer",
      });
      const result: ResponseData = await response.json();
      if (!response.ok || !result.quotation) throw new Error(result.error ?? "Your decision could not be recorded.");
      const decidedQuotation = result.quotation;
      setQuotation((current) => current ? { ...current, status: decidedQuotation.status } : current);
      setSuccess(`Quotation ${decision === "APPROVE" ? "approved" : "rejected"} successfully.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your decision could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-2xl space-y-5">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
          <p className="text-sm font-bold text-orange-600">BizFlow Auto</p>
          <h1 className="mt-2 text-2xl font-black">Quotation review</h1>
          <p className="mt-1 text-sm text-slate-500">Review the work and costs below. Your decision is recorded securely.</p>
        </header>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
        {loading && <p className="rounded-xl bg-white p-5 text-sm text-slate-500">Loading quotation…</p>}
        {!loading && quotation && (
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-orange-600">QUO-{String(quotation.id).padStart(6, "0")}</p>
              <h2 className="mt-1 text-lg font-bold">Hello {quotation.appointment.customer.name}</h2>
              <p className="text-sm text-slate-600">{quotation.appointment.service.name} · {quotation.appointment.vehicle.make} {quotation.appointment.vehicle.model} · {quotation.appointment.vehicle.registrationNumber}</p>
            </div>
            <ul className="space-y-2 border-y border-slate-100 py-4 text-sm">
              {quotation.items.map((item, index) => (
                <li key={`${item.description}-${index}`} className="flex justify-between gap-3">
                  <span>{item.description} · {item.quantity} × {money(item.unitPrice)}{Number(item.discountAmount) ? ` · discount ${money(item.discountAmount)}` : ""}</span>
                  <span className="shrink-0 font-semibold">{money(item.lineTotal)}</span>
                </li>
              ))}
            </ul>
            {quotation.notes && <p className="whitespace-pre-wrap text-sm text-slate-600">{quotation.notes}</p>}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-lg font-black">{money(quotation.totalAmount)}</p>
                <p className="text-xs text-slate-500">Please respond by {new Date(quotation.expiresAt).toLocaleDateString()}.</p>
              </div>
              {quotation.status === "SENT" ? (
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => void decide("REJECT")} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Reject</button>
                  <button type="button" disabled={busy} onClick={() => void decide("APPROVE")} className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Approve"}</button>
                </div>
              ) : <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{quotation.status}</span>}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
