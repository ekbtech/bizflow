"use client";

import { useEffect, useState } from "react";

type Quotation = {
  id: number;
  status: string;
  totalAmount: string | number;
  expiresAt: string;
  notes: string | null;
  items: {
    id: number;
    itemType: string;
    description: string;
    quantity: string | number;
    unitPrice: string | number;
    discountAmount: string | number;
    lineTotal: string | number;
  }[];
  appointment: {
    vehicle: { registrationNumber: string; make: string; model: string };
    service: { name: string };
  };
};
type ResponseData = { quotations?: Quotation[]; error?: string };

function money(value: string | number) {
  return `KSh ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CustomerQuotationManager() {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadQuotations() {
    const response = await fetch("/api/customer/quotations", { credentials: "same-origin", cache: "no-store" });
    const result: ResponseData = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Your quotations could not be loaded.");
    setQuotations(result.quotations ?? []);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/customer/quotations", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result: ResponseData = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Your quotations could not be loaded.");
        if (active) setQuotations(result.quotations ?? []);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Your quotations could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function decide(quotationId: number, decision: "APPROVE" | "REJECT") {
    const action = decision === "APPROVE" ? "approve this quotation" : "reject this quotation";
    if (!window.confirm(`Are you sure you want to ${action}?`)) return;
    setBusyId(quotationId);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/customer/quotations/${quotationId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const result: { quotation?: { status: string }; error?: string } = await response.json();
      if (!response.ok || !result.quotation) throw new Error(result.error ?? "Your decision could not be recorded.");
      setSuccess(`Your quotation was ${decision === "APPROVE" ? "approved" : "rejected"}.`);
      await loadQuotations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your decision could not be recorded.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="rounded-xl bg-white p-5 text-sm text-slate-500">Loading your quotations…</p>;

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
      {quotations.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">No quotations are available for your account yet.</p>}
      {quotations.map((quotation) => (
        <article key={quotation.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-orange-600">QUO-{String(quotation.id).padStart(6, "0")}</p>
              <h2 className="mt-1 text-lg font-bold">{quotation.appointment.vehicle.make} {quotation.appointment.vehicle.model} · {quotation.appointment.vehicle.registrationNumber}</h2>
              <p className="text-sm text-slate-600">{quotation.appointment.service.name}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{quotation.status}</span>
          </div>
          <ul className="space-y-1 border-y border-slate-100 py-3 text-sm text-slate-600">
            {quotation.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span>{item.description} · {item.quantity} × {money(item.unitPrice)}{Number(item.discountAmount) ? ` (discount ${money(item.discountAmount)})` : ""}</span>
                <span className="shrink-0 font-medium">{money(item.lineTotal)}</span>
              </li>
            ))}
          </ul>
          {quotation.notes && <p className="whitespace-pre-wrap text-sm text-slate-600">{quotation.notes}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold">{money(quotation.totalAmount)}</p>
              <p className="text-xs text-slate-500">Expires {new Date(quotation.expiresAt).toLocaleDateString()}</p>
            </div>
            {quotation.status === "SENT" && new Date(quotation.expiresAt) > new Date() && (
              <div className="flex gap-2">
                <button type="button" disabled={busyId === quotation.id} onClick={() => void decide(quotation.id, "REJECT")} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Reject</button>
                <button type="button" disabled={busyId === quotation.id} onClick={() => void decide(quotation.id, "APPROVE")} className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busyId === quotation.id ? "Saving…" : "Approve"}</button>
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
