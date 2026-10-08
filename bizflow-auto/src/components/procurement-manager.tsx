"use client";

import { useEffect, useState, type FormEvent } from "react";

type Supplier = {
  id: number;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
};
type Part = { id: number; name: string; partNumber: string | null; quantity: number; unitPrice: string | number };
type PurchaseItem = {
  id: number;
  quantity: number;
  receivedQuantity: number;
  unitCost: string | number;
  part: { id: number; name: string; partNumber: string | null };
};
type PurchaseOrder = {
  id: number;
  status: string;
  expectedAt: string | null;
  notes: string | null;
  createdAt: string;
  supplier: { id: number; name: string };
  createdBy: { name: string };
  items: PurchaseItem[];
};
type ResponseData = {
  suppliers?: Supplier[];
  parts?: Part[];
  purchaseOrders?: PurchaseOrder[];
  error?: string;
};
type DraftItem = { partId: string; quantity: string; unitCost: string };

function currency(value: number) {
  return `KSh ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ProcurementManager() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([{ partId: "", quantity: "1", unitCost: "" }]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function loadData() {
    const responses = await Promise.all([
      fetch("/api/suppliers", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/spare-parts", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/purchases", { credentials: "same-origin", cache: "no-store" }),
    ]);
    const results = await Promise.all(responses.map((response) => response.json() as Promise<ResponseData>));
    const failed = responses.findIndex((response) => !response.ok);
    if (failed >= 0) throw new Error(results[failed].error ?? "Procurement data could not be loaded.");
    setSuppliers(results[0].suppliers ?? []);
    setParts(results[1].parts ?? []);
    setOrders(results[2].purchaseOrders ?? []);
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/suppliers", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/spare-parts", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/purchases", { credentials: "same-origin", cache: "no-store" }),
    ])
      .then(async (responses) => {
        const results = await Promise.all(responses.map((response) => response.json() as Promise<ResponseData>));
        const failed = responses.findIndex((response) => !response.ok);
        if (failed >= 0) throw new Error(results[failed].error ?? "Procurement data could not be loaded.");
        if (active) {
          setSuppliers(results[0].suppliers ?? []);
          setParts(results[1].parts ?? []);
          setOrders(results[2].purchaseOrders ?? []);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Procurement data could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function submitJson(url: string, method: "POST" | "PATCH", body: unknown, successMessage: string): Promise<boolean> {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(url, {
        method,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result: ResponseData = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The procurement update failed.");
      await loadData();
      setSuccess(successMessage);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The procurement update failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const submitted = await submitJson("/api/suppliers", "POST", {
      name: values.get("name"),
      contactPerson: values.get("contactPerson"),
      phone: values.get("phone"),
      email: values.get("email"),
      address: values.get("address"),
      notes: values.get("notes"),
    }, "Supplier created.");
    if (submitted) form.reset();
  }

  async function createPurchaseOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const lines = draftItems.filter((item) => item.partId).map((item) => ({
      partId: Number(item.partId),
      quantity: Number(item.quantity),
      unitCost: Number(item.unitCost),
    }));
    if (!lines.length) {
      setError("Add at least one part to the purchase order.");
      return;
    }
    const expectedAt = values.get("expectedAt");
    const submitted = await submitJson("/api/purchases", "POST", {
      supplierId: Number(values.get("supplierId")),
      expectedAt: expectedAt ? new Date(String(expectedAt)).toISOString() : null,
      notes: values.get("notes"),
      items: lines,
    }, "Draft purchase order created.");
    if (submitted) {
      setDraftItems([{ partId: "", quantity: "1", unitCost: "" }]);
      form.reset();
    }
  }

  async function receiveOrder(event: FormEvent<HTMLFormElement>, order: PurchaseOrder) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const lines = order.items.map((item) => ({
      itemId: item.id,
      quantity: Number(values.get(`received-${item.id}`) ?? 0),
    })).filter((item) => item.quantity > 0);
    if (!lines.length) {
      setError("Enter a quantity to receive for at least one outstanding line.");
      return;
    }
    await submitJson(`/api/purchases/${order.id}`, "PATCH", {
      action: "RECEIVE",
      items: lines,
      note: values.get("receiptNote"),
    }, `Receipt posted for PO-${String(order.id).padStart(6, "0")}; stock and ledger updated.`);
  }

  if (loading) return <p className="rounded-xl bg-white p-5 text-sm text-slate-500">Loading procurement…</p>;

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <form onSubmit={(event) => void addSupplier(event)} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft sm:grid-cols-2">
            <h2 className="text-xl font-black sm:col-span-2">Add supplier</h2>
            <input name="name" required minLength={2} maxLength={255} placeholder="Supplier name" className="rounded-xl border border-slate-200 px-3 py-2" />
            <input name="contactPerson" maxLength={255} placeholder="Contact person" className="rounded-xl border border-slate-200 px-3 py-2" />
            <input name="phone" maxLength={50} placeholder="Phone" className="rounded-xl border border-slate-200 px-3 py-2" />
            <input name="email" type="email" maxLength={255} placeholder="Email" className="rounded-xl border border-slate-200 px-3 py-2" />
            <input name="address" maxLength={5000} placeholder="Address" className="rounded-xl border border-slate-200 px-3 py-2 sm:col-span-2" />
            <textarea name="notes" maxLength={5000} placeholder="Notes" className="min-h-16 rounded-xl border border-slate-200 px-3 py-2 sm:col-span-2" />
            <button disabled={busy} className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">Save supplier</button>
          </form>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
            <h2 className="mb-3 text-xl font-black">Suppliers ({suppliers.length})</h2>
            <div className="space-y-2">
              {suppliers.map((supplier) => (
                <article key={supplier.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{supplier.name} <span className={`ml-1 text-xs ${supplier.isActive ? "text-emerald-700" : "text-slate-500"}`}>{supplier.isActive ? "Active" : "Inactive"}</span></p>
                    <p className="text-xs text-slate-500">{[supplier.contactPerson, supplier.phone, supplier.email].filter(Boolean).join(" · ") || "No contact details"}</p>
                  </div>
                  <button type="button" disabled={busy} onClick={() => void submitJson(`/api/suppliers/${supplier.id}`, "PATCH", { isActive: !supplier.isActive }, `Supplier ${supplier.isActive ? "deactivated" : "reactivated"}.`)} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
                    {supplier.isActive ? "Deactivate" : "Reactivate"}
                  </button>
                </article>
              ))}
              {suppliers.length === 0 && <p className="text-sm text-slate-500">No suppliers have been added.</p>}
            </div>
          </section>
        </div>

        <form onSubmit={(event) => void createPurchaseOrder(event)} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div>
            <h2 className="text-xl font-black">Create purchase order</h2>
            <p className="mt-1 text-sm text-slate-500">Stock is added only when a receipt is recorded against an ordered purchase.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">Supplier
              <select name="supplierId" required defaultValue="" className="mt-1 w-full rounded-xl border border-slate-200 p-2">
                <option value="" disabled>Select active supplier</option>
                {suppliers.filter((supplier) => supplier.isActive).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold">Expected delivery
              <input name="expectedAt" type="datetime-local" className="mt-1 w-full rounded-xl border border-slate-200 p-2 font-normal" />
            </label>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-bold">Order lines</h3>
            {draftItems.map((line, index) => (
              <div key={index} className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_100px_130px_auto]">
                <label className="text-xs font-semibold">Part
                  <select required={index === 0} value={line.partId} onChange={(event) => setDraftItems((current) => current.map((item, lineIndex) => lineIndex === index ? { ...item, partId: event.target.value } : item))} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm font-normal">
                    <option value="">Select part</option>
                    {parts.map((part) => <option key={part.id} value={part.id}>{part.name}{part.partNumber ? ` (${part.partNumber})` : ""}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold">Quantity
                  <input type="number" min="1" max="1000000" required={!!line.partId || index === 0} value={line.quantity} onChange={(event) => setDraftItems((current) => current.map((item, lineIndex) => lineIndex === index ? { ...item, quantity: event.target.value } : item))} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm font-normal" />
                </label>
                <label className="text-xs font-semibold">Unit cost
                  <input type="number" min="0.01" max="10000000" step="0.01" required={!!line.partId || index === 0} value={line.unitCost} onChange={(event) => setDraftItems((current) => current.map((item, lineIndex) => lineIndex === index ? { ...item, unitCost: event.target.value } : item))} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm font-normal" />
                </label>
                <button type="button" disabled={draftItems.length === 1} onClick={() => setDraftItems((current) => current.filter((_, lineIndex) => lineIndex !== index))} aria-label={`Remove purchase line ${index + 1}`} className="self-end rounded-full border border-slate-300 px-3 py-2 text-xs disabled:opacity-40">Remove</button>
              </div>
            ))}
            <button type="button" onClick={() => setDraftItems((current) => [...current, { partId: "", quantity: "1", unitCost: "" }])} className="text-sm font-semibold text-orange-700">+ Add order line</button>
          </div>
          <label className="block text-sm font-semibold">Notes
            <textarea name="notes" maxLength={5000} className="mt-1 min-h-16 w-full rounded-xl border border-slate-200 p-2 font-normal" />
          </label>
          <button disabled={busy || suppliers.every((supplier) => !supplier.isActive) || parts.length === 0} className="w-full rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save draft purchase order</button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h2 className="mb-4 text-xl font-black">Purchase orders</h2>
        <div className="space-y-4">
          {orders.map((order) => {
            const total = order.items.reduce((sum, item) => sum + item.quantity * Number(item.unitCost), 0);
            const outstanding = order.items.some((item) => item.receivedQuantity < item.quantity);
            return (
              <article key={order.id} className="space-y-3 rounded-xl border border-slate-200 p-4">
                <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-orange-700">PO-{String(order.id).padStart(6, "0")} · {order.status.replaceAll("_", " ")}</p>
                    <h3 className="mt-1 font-bold">{order.supplier.name}</h3>
                    <p className="text-xs text-slate-500">Created by {order.createdBy.name} · {new Date(order.createdAt).toLocaleDateString()}{order.expectedAt ? ` · Due ${new Date(order.expectedAt).toLocaleDateString()}` : ""}</p>
                  </div>
                  <p className="font-bold">{currency(total)}</p>
                </header>
                <div className="space-y-1">
                  {order.items.map((item) => (
                    <p key={item.id} className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-2 text-sm">
                      <span>{item.part.name}{item.part.partNumber ? ` (${item.part.partNumber})` : ""}</span>
                      <span>{item.receivedQuantity} / {item.quantity} received · {currency(Number(item.unitCost))} each</span>
                    </p>
                  ))}
                </div>
                {order.notes && <p className="text-sm text-slate-600">{order.notes}</p>}
                {(order.status === "DRAFT" || order.status === "ORDERED" || order.status === "PARTIALLY_RECEIVED") && (
                  <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    {order.status === "DRAFT" && <button type="button" disabled={busy} onClick={() => void submitJson(`/api/purchases/${order.id}`, "PATCH", { action: "ORDER" }, `PO-${String(order.id).padStart(6, "0")} placed with supplier.`)} className="rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Place order</button>}
                    {(order.status === "DRAFT" || order.status === "ORDERED") && <button type="button" disabled={busy} onClick={() => void submitJson(`/api/purchases/${order.id}`, "PATCH", { action: "CANCEL" }, `PO-${String(order.id).padStart(6, "0")} cancelled.`)} className="rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 disabled:opacity-50">Cancel order</button>}
                    {["ORDERED", "PARTIALLY_RECEIVED"].includes(order.status) && outstanding && (
                      <form onSubmit={(event) => void receiveOrder(event, order)} className="grid w-full gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_auto]">
                        <div className="grid gap-2 sm:grid-cols-2">
                          {order.items.filter((item) => item.receivedQuantity < item.quantity).map((item) => (
                            <label key={item.id} className="text-xs font-semibold">{item.part.name} · remaining {item.quantity - item.receivedQuantity}
                              <input name={`received-${item.id}`} type="number" min="0" max={item.quantity - item.receivedQuantity} defaultValue="0" className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm font-normal" />
                            </label>
                          ))}
                          <label className="text-xs font-semibold sm:col-span-2">Receipt note
                            <input name="receiptNote" maxLength={500} placeholder="Delivery reference or condition" className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm font-normal" />
                          </label>
                        </div>
                        <button disabled={busy} className="self-end rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Post receipt</button>
                      </form>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {orders.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No purchase orders yet.</p>}
        </div>
      </section>
    </div>
  );
}
