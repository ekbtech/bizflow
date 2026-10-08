"use client";

import { useEffect, useState } from "react";

type ItemType = "LABOUR" | "PART" | "DIAGNOSTIC" | "EXTERNAL" | "MISCELLANEOUS";
type QuotationItem = {
  id?: number;
  itemType: ItemType;
  partId: number | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  lineTotal: string;
};
type Appointment = {
  id: number;
  appointmentDate: string;
  customer: { name: string; email: string | null };
  vehicle: { registrationNumber: string; make: string; model: string };
  service: { name: string; price: string | number; priceConfigured: boolean };
};
type Part = { id: number; name: string; partNumber: string | null; quantity: number; unitPrice: string | number };
type Quotation = {
  id: number;
  status: string;
  totalAmount: string | number;
  expiresAt: string;
  sentAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  notes: string | null;
  items: QuotationItem[];
  appointment: Appointment & { jobCard: { id: number; status: string; mechanic: { name: string } } | null };
  createdBy: { name: string };
  approvedBy: { name: string } | null;
};
type ResponseData = {
  quotations?: Quotation[];
  eligibleAppointments?: Appointment[];
  parts?: Part[];
  error?: string;
};

const itemTypes: ItemType[] = ["LABOUR", "PART", "DIAGNOSTIC", "EXTERNAL", "MISCELLANEOUS"];

function emptyItem(itemType: ItemType = "LABOUR"): QuotationItem {
  return { itemType, partId: null, description: "", quantity: "1", unitPrice: "0", discountAmount: "0", lineTotal: "0" };
}

function money(value: string | number) {
  return `KSh ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusStyle(status: string) {
  if (status === "APPROVED") return "bg-emerald-100 text-emerald-800";
  if (status === "REJECTED" || status === "EXPIRED") return "bg-slate-100 text-slate-700";
  if (status === "SENT") return "bg-amber-100 text-amber-800";
  return "bg-blue-100 text-blue-800";
}

export function QuotationManager({ todayDate, initialExpiryDate }: { todayDate: string; initialExpiryDate: string }) {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [appointmentId, setAppointmentId] = useState("");
  const [expiresAt, setExpiresAt] = useState(initialExpiryDate);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<QuotationItem[]>([emptyItem()]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [approvalLink, setApprovalLink] = useState("");

  async function loadQuotations() {
    const response = await fetch("/api/quotations", { credentials: "same-origin", cache: "no-store" });
    const result: ResponseData = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Quotations could not be loaded.");
    setQuotations(result.quotations ?? []);
    setAppointments(result.eligibleAppointments ?? []);
    setParts(result.parts ?? []);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/quotations", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result: ResponseData = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Quotations could not be loaded.");
        if (active) {
          setQuotations(result.quotations ?? []);
          setAppointments(result.eligibleAppointments ?? []);
          setParts(result.parts ?? []);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Quotations could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function openQuotation(quotation: Quotation) {
    setSelectedId(quotation.id);
    setAppointmentId(String(quotation.appointment.id));
    setExpiresAt(quotation.expiresAt.slice(0, 10));
    setNotes(quotation.notes ?? "");
    setItems(quotation.items.length ? quotation.items.map((item) => ({
      ...item,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      discountAmount: String(item.discountAmount),
    })) : [emptyItem()]);
    setError("");
    setSuccess("");
    setApprovalLink("");
  }

  async function createDraft() {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const response = await fetch("/api/quotations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: Number(appointmentId), expiresAt }),
      });
      const result: { quotation?: { id: number }; error?: string } = await response.json();
      if (!response.ok || !result.quotation) throw new Error(result.error ?? "Draft quotation could not be created.");
      const appointment = appointments.find((entry) => entry.id === Number(appointmentId));
      const newItem = emptyItem("LABOUR");
      if (appointment) {
        newItem.description = appointment.service.name;
        newItem.unitPrice = appointment.service.priceConfigured ? String(appointment.service.price) : "";
      }
      setItems([newItem]);
      setSelectedId(result.quotation.id);
      setNotes("");
      setSuccess(`Draft QUO-${String(result.quotation.id).padStart(6, "0")} created. Add all authorized work before sending it.`);
      await loadQuotations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Draft quotation could not be created.");
    } finally {
      setBusy(false);
    }
  }

  function changeItem(index: number, change: Partial<QuotationItem>) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...change } : item));
  }

  function selectPart(index: number, value: string) {
    const partId = Number(value) || null;
    const part = parts.find((entry) => entry.id === partId);
    changeItem(index, {
      partId,
      description: part?.name ?? "",
      unitPrice: part ? String(part.unitPrice) : "0",
    });
  }

  async function saveDraft() {
    if (!selectedId) return false;
    const response = await fetch(`/api/quotations/${selectedId}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "SAVE_DRAFT",
        expiresAt,
        notes,
        items: items.map(({ itemType, partId, description, quantity, unitPrice, discountAmount }) => ({
          itemType,
          partId: itemType === "PART" ? partId : null,
          description,
          quantity,
          unitPrice,
          discountAmount,
        })),
      }),
    });
    const result: { error?: string } = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Draft quotation could not be saved.");
    return true;
  }

  async function saveAndSend() {
    if (!selectedId) return;
    setBusy(true);
    setError("");
    setSuccess("");
    setApprovalLink("");
    try {
      await saveDraft();
      const response = await fetch(`/api/quotations/${selectedId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SEND" }),
      });
      const result: { error?: string; emailNotification?: { sent: boolean; reason: string }; approvalLink?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Quotation could not be sent.");
      setSuccess(result.emailNotification?.sent
        ? `Quotation QUO-${String(selectedId).padStart(6, "0")} was emailed to the customer.`
        : `Quotation sent, but email delivery was not confirmed (${result.emailNotification?.reason.replaceAll("_", " ") ?? "unknown reason"}).`);
      setApprovalLink(result.approvalLink ?? "");
      setSelectedId(null);
      await loadQuotations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Quotation could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="rounded-xl bg-white p-5 text-sm text-slate-500">Loading quotations…</p>;

  const activeQuoteAppointments = new Set(quotations
    .filter((quote) => quote.status === "DRAFT" || quote.status === "SENT" || quote.status === "APPROVED")
    .map((quote) => quote.appointment.id));
  const editable = quotations.find((quote) => quote.id === selectedId)?.status === "DRAFT";
  const displayedQuote = quotations.find((quote) => quote.id === selectedId);

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
      {approvalLink && (
        <p className="break-all rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Email delivery failed. Share this private response link directly with the customer: <a className="font-semibold underline" href={approvalLink}>{approvalLink}</a>
        </p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h2 className="text-xl font-black">Create quotation</h2>
        <p className="mt-1 text-sm text-slate-500">Only checked-in jobs with a completed inspection and diagnostic record are eligible.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_12rem_auto]">
          <select value={appointmentId} onChange={(event) => setAppointmentId(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2">
            <option value="">Select inspected appointment</option>
            {appointments.filter((appointment) => !activeQuoteAppointments.has(appointment.id)).map((appointment) => (
              <option key={appointment.id} value={appointment.id}>
                #{appointment.id} · {appointment.customer.name} · {appointment.vehicle.registrationNumber} · {appointment.service.name}
              </option>
            ))}
          </select>
          <input aria-label="Quotation expiry date" type="date" min={todayDate} value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2" />
          <button type="button" disabled={busy || !appointmentId} onClick={() => void createDraft()} className="rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Creating…" : "Create draft"}
          </button>
        </div>
        {appointments.find((appointment) => appointment.id === Number(appointmentId))?.service.priceConfigured === false && (
          <p className="mt-2 text-sm font-medium text-amber-700">Set the service price in the quotation after inspection.</p>
        )}
      </section>

      {displayedQuote && editable && (
        <section className="space-y-4 rounded-2xl border border-orange-200 bg-white p-5 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Edit QUO-{String(displayedQuote.id).padStart(6, "0")}</h2>
              <p className="mt-1 text-sm text-slate-500">{displayedQuote.appointment.customer.name} · {displayedQuote.appointment.vehicle.registrationNumber}</p>
            </div>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Expires
              <input type="date" min={todayDate} value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2" />
            </label>
          </div>
          <div className="space-y-3">
            {items.map((item, index) => (
              <fieldset key={index} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-6">
                <legend className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500">Line {index + 1}</legend>
                <select value={item.itemType} onChange={(event) => changeItem(index, { itemType: event.target.value as ItemType, partId: null })} className="rounded-lg border border-slate-200 px-2 py-2 text-sm">
                  {itemTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
                </select>
                {item.itemType === "PART" ? (
                  <select required value={item.partId ?? ""} onChange={(event) => selectPart(index, event.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-sm lg:col-span-2">
                    <option value="">Select stocked part</option>
                    {parts.map((part) => <option key={part.id} value={part.id}>{part.name}{part.partNumber ? ` · ${part.partNumber}` : ""} · {part.quantity} in stock</option>)}
                  </select>
                ) : (
                  <input required maxLength={500} value={item.description} onChange={(event) => changeItem(index, { description: event.target.value })} placeholder="Description" className="rounded-lg border border-slate-200 px-2 py-2 text-sm lg:col-span-2" />
                )}
                <input required type="number" min="0.01" max="99999999" step="0.01" value={item.quantity} onChange={(event) => changeItem(index, { quantity: event.target.value })} aria-label={`Quantity for line ${index + 1}`} className="rounded-lg border border-slate-200 px-2 py-2 text-sm" />
                <input required type="number" min="0" max="99999999" step="0.01" value={item.unitPrice} onChange={(event) => changeItem(index, { unitPrice: event.target.value })} aria-label={`Unit price for line ${index + 1}`} className="rounded-lg border border-slate-200 px-2 py-2 text-sm" />
                <div className="flex gap-2 lg:col-span-2">
                  <input required type="number" min="0" max="99999999" step="0.01" value={item.discountAmount} onChange={(event) => changeItem(index, { discountAmount: event.target.value })} aria-label={`Discount for line ${index + 1}`} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm" />
                  <button type="button" disabled={items.length === 1} aria-label={`Remove line ${index + 1}`} onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg border border-slate-200 px-3 text-sm text-red-700 disabled:opacity-40">Remove</button>
                </div>
              </fieldset>
            ))}
            <button type="button" onClick={() => setItems((current) => [...current, emptyItem()])} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold">+ Add line</button>
          </div>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Customer-facing notes and terms
            <textarea maxLength={5000} value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20 rounded-xl border border-slate-200 px-3 py-2" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await saveDraft();
                setSuccess("Draft quotation saved.");
                await loadQuotations();
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : "Draft quotation could not be saved.");
              } finally {
                setBusy(false);
              }
            }} className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold disabled:opacity-50">Save draft</button>
            <button type="button" disabled={busy} onClick={() => void saveAndSend()} className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? "Saving…" : "Save and email for approval"}
            </button>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xl font-black">Quotation history</h2>
        {quotations.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">No quotations created yet.</p>}
        {quotations.map((quotation) => (
          <article key={quotation.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-orange-600">QUO-{String(quotation.id).padStart(6, "0")} · Appointment #{quotation.appointment.id}</p>
                <h3 className="mt-1 text-lg font-bold">{quotation.appointment.customer.name} · {quotation.appointment.vehicle.registrationNumber}</h3>
                <p className="text-sm text-slate-600">{quotation.appointment.service.name} · {quotation.appointment.vehicle.make} {quotation.appointment.vehicle.model}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyle(quotation.status)}`}>{quotation.status}</span>
            </div>
            <p className="mt-3 text-sm font-semibold">{money(quotation.totalAmount)} · Expires {new Date(quotation.expiresAt).toLocaleDateString()}</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {quotation.items.map((item) => <li key={item.id}>{item.description} · {item.quantity} × {money(item.unitPrice)}{Number(item.discountAmount) ? ` · discount ${money(item.discountAmount)}` : ""} · {money(item.lineTotal)}</li>)}
            </ul>
            {quotation.approvedBy && <p className="mt-2 text-xs text-emerald-700">Approved by {quotation.approvedBy.name}</p>}
            {quotation.appointment.jobCard && <p className="mt-2 text-xs text-slate-500">Job JC-{quotation.appointment.jobCard.id} · {quotation.appointment.jobCard.mechanic.name}</p>}
            {quotation.status === "DRAFT" && <button type="button" onClick={() => openQuotation(quotation)} className="mt-3 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold">Edit draft</button>}
          </article>
        ))}
      </section>
    </div>
  );
}
