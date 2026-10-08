"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DEFAULT_REORDER_LEVEL } from "@/lib/inventory";

type Part = { id: number; name: string; partNumber: string | null; quantity: number; stockCounted: boolean; reorderLevel: number };
type Transaction = {
  id: number;
  partId: number;
  quantity: number;
  transactionType: "IN" | "OUT" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "TRANSFER";
  note: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  createdAt: string;
  part: { name: string; partNumber: string | null };
  supplier: { name: string } | null;
  purchaseOrder: { id: number } | null;
  createdBy: { name: string } | null;
};
type Result = { parts?: Part[]; transactions?: Transaction[]; error?: string };
type Movement = "ISSUE" | "ADJUST" | "TRANSFER";

function typeLabel(type: Transaction["transactionType"]) {
  return type.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function InventoryMovementManager() {
  const [parts, setParts] = useState<Part[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [movement, setMovement] = useState<Movement>("ADJUST");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const filteredTransactions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return transactions;
    return transactions.filter((transaction) => [
      transaction.part.name,
      transaction.part.partNumber ?? "",
      transaction.transactionType,
      transaction.note ?? "",
      transaction.supplier?.name ?? "",
      transaction.purchaseOrder ? `po-${String(transaction.purchaseOrder.id).padStart(6, "0")}` : "",
      transaction.fromLocation ?? "",
      transaction.toLocation ?? "",
      transaction.createdBy?.name ?? "",
    ].some((value) => value.toLowerCase().includes(normalizedQuery)));
  }, [query, transactions]);

  async function loadData() {
    const [partsResponse, transactionsResponse] = await Promise.all([
      fetch("/api/spare-parts", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/inventory-transactions", { credentials: "same-origin", cache: "no-store" }),
    ]);
    const [partResult, transactionResult]: [Result, Result] = await Promise.all([partsResponse.json(), transactionsResponse.json()]);
    if (!partsResponse.ok) throw new Error(partResult.error ?? "Spare parts could not be loaded.");
    if (!transactionsResponse.ok) throw new Error(transactionResult.error ?? "Stock transactions could not be loaded.");
    setParts(partResult.parts ?? []);
    setTransactions(transactionResult.transactions ?? []);
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/spare-parts", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/inventory-transactions", { credentials: "same-origin", cache: "no-store" }),
    ])
      .then(async ([partsResponse, transactionsResponse]) => {
        const [partResult, transactionResult]: [Result, Result] = await Promise.all([partsResponse.json(), transactionsResponse.json()]);
        if (!partsResponse.ok) throw new Error(partResult.error ?? "Spare parts could not be loaded.");
        if (!transactionsResponse.ok) throw new Error(transactionResult.error ?? "Stock transactions could not be loaded.");
        if (active) {
          setParts(partResult.parts ?? []);
          setTransactions(transactionResult.transactions ?? []);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Inventory data could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function saveMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const partId = Number(values.get("partId"));
    const note = String(values.get("note") ?? "");
    const body = movement === "ISSUE"
      ? { action: movement, partId, quantity: Number(values.get("quantity")), note }
      : movement === "ADJUST"
        ? { action: movement, partId, newQuantity: Number(values.get("newQuantity")), note }
        : {
            action: movement,
            partId,
            quantity: Number(values.get("quantity")),
            fromLocation: values.get("fromLocation"),
            toLocation: values.get("toLocation"),
            note,
          };
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/inventory-transactions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result: Result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Inventory movement could not be recorded.");
      await loadData();
      form.reset();
      setSuccess(movement === "TRANSFER" ? "Transfer recorded; the single overall stock balance is unchanged." : "Inventory movement recorded and stock ledger updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Inventory movement could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <form onSubmit={(event) => void saveMovement(event)} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <h2 className="text-xl font-black">Update stock quantities</h2>
          <label className="block text-sm font-semibold">Movement type
            <select value={movement} onChange={(event) => setMovement(event.target.value as Movement)} className="mt-1 w-full rounded-xl border border-slate-200 p-2">
              <option value="ADJUST">Set remaining stock count</option>
              <option value="ISSUE">Issue stock</option>
              <option value="TRANSFER">Record location transfer</option>
            </select>
          </label>
          <label className="block text-sm font-semibold">Spare part
            <select name="partId" required defaultValue="" className="mt-1 w-full rounded-xl border border-slate-200 p-2">
              <option value="" disabled>Select part</option>
              {parts.map((part) => <option key={part.id} value={part.id}>{part.name} · {part.stockCounted ? `${part.quantity} counted` : "not counted"}</option>)}
            </select>
          </label>
          {movement === "ADJUST" ? (
            <label className="block text-sm font-semibold">Parts remaining in stock
              <input name="newQuantity" type="number" min="0" max="1000000" required className="mt-1 w-full rounded-xl border border-slate-200 p-2 font-normal" />
              <span className="mt-1 block text-xs font-normal text-slate-500">Enter the total number physically available now, not the amount to add.</span>
            </label>
          ) : (
            <label className="block text-sm font-semibold">Quantity
              <input name="quantity" type="number" min="1" max="1000000" required className="mt-1 w-full rounded-xl border border-slate-200 p-2 font-normal" />
            </label>
          )}
          {movement === "TRANSFER" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">From location
                <input name="fromLocation" required maxLength={120} placeholder="Main Store" className="mt-1 w-full rounded-xl border border-slate-200 p-2 font-normal" />
              </label>
              <label className="text-sm font-semibold">To location
                <input name="toLocation" required maxLength={120} placeholder="Workshop" className="mt-1 w-full rounded-xl border border-slate-200 p-2 font-normal" />
              </label>
            </div>
          )}
          <label className="block text-sm font-semibold">{movement === "ISSUE" ? "Reason" : "Reason or notes (optional)"}
            <input name="note" required={movement === "ISSUE"} minLength={movement === "ISSUE" ? 2 : undefined} maxLength={500} className="mt-1 w-full rounded-xl border border-slate-200 p-2 font-normal" />
          </label>
          {movement === "TRANSFER" && <p className="text-xs text-slate-500">This setup tracks one total stock balance. The transfer is recorded for traceability and does not change that balance.</p>}
          <button disabled={busy || loading || parts.length === 0} className="w-full rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Record movement"}
          </button>
        </form>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <h2 className="mb-3 text-xl font-black">Reorder alerts</h2>
          <div className="space-y-2">
            {parts.filter((part) => part.stockCounted && part.quantity <= (part.reorderLevel || DEFAULT_REORDER_LEVEL)).map((part) => (
              <article key={part.id} className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                <span className="font-semibold text-amber-950">{part.name}{part.partNumber ? ` (${part.partNumber})` : ""}</span>
                <span className="text-right text-amber-900">{part.quantity} available · reorder at {part.reorderLevel || DEFAULT_REORDER_LEVEL}</span>
              </article>
            ))}
            {!loading && parts.filter((part) => part.stockCounted && part.quantity <= (part.reorderLevel || DEFAULT_REORDER_LEVEL)).length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No parts are currently at or below their reorder level.</p>}
          </div>
        </section>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-black">Stock transaction ledger</h2>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search recent movements" aria-label="Search stock transactions" className="rounded-xl border border-slate-200 px-3 py-2 text-sm sm:w-72" />
        </div>
        {loading ? <p className="text-sm text-slate-500">Loading transaction history…</p> : (
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Date</th><th className="px-3 py-2">Part</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Quantity</th><th className="px-3 py-2">Reference / location</th><th className="px-3 py-2">Recorded by</th><th className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((transaction) => (
                <tr key={transaction.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-3 py-2">{new Date(transaction.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2 font-medium">{transaction.part.name}</td>
                  <td className="px-3 py-2">{typeLabel(transaction.transactionType)}</td>
                  <td className="px-3 py-2">{transaction.quantity}</td>
                  <td className="px-3 py-2">{transaction.purchaseOrder ? `PO-${String(transaction.purchaseOrder.id).padStart(6, "0")}` : transaction.supplier?.name ?? "—"}{transaction.fromLocation && transaction.toLocation ? ` · ${transaction.fromLocation} → ${transaction.toLocation}` : ""}</td>
                  <td className="px-3 py-2">{transaction.createdBy?.name ?? "Historical"}</td>
                  <td className="max-w-xs px-3 py-2">{transaction.note ?? "—"}</td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && <tr><td colSpan={7} className="px-3 py-5 text-slate-500">{transactions.length ? "No transactions match the search." : "No stock transactions have been recorded."}</td></tr>}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
