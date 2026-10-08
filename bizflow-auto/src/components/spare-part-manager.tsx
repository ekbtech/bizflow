"use client";

import { useEffect, useState, type FormEvent } from "react";
import { DEFAULT_REORDER_LEVEL } from "@/lib/inventory";

type Part = {
  id: number;
  name: string;
  partNumber: string | null;
  quantity: number;
  stockCounted: boolean;
  unitPrice: number | string;
  priceConfigured: boolean;
  category: string;
  vehicleType: "CAR" | "BICYCLE" | "MOTORBIKE" | "UNIVERSAL";
  reorderLevel: number;
};

export function SparePartManager({ canManage, canDelete }: { canManage: boolean; canDelete: boolean }) {
  const [parts, setParts] = useState<Part[]>([]);
  const [restockingId, setRestockingId] = useState<number | null>(null);
  const [editingPartId, setEditingPartId] = useState<number | null>(null);
  const [editingStockId, setEditingStockId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState("ALL");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const filteredParts = parts.filter((part) => {
    const matchesType = vehicleTypeFilter === "ALL" || part.vehicleType === vehicleTypeFilter;
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery = !normalizedQuery || [part.name, part.partNumber ?? "", part.category]
      .some((value) => value.toLowerCase().includes(normalizedQuery));
    return matchesType && matchesQuery;
  });

  async function loadParts() {
    const response = await fetch("/api/spare-parts", { credentials: "same-origin", cache: "no-store" });
    const result: { parts?: Part[]; error?: string } = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Spare parts could not be loaded.");
    setParts(result.parts ?? []);
  }

  useEffect(() => {
    let cancelled = false;

    fetch("/api/spare-parts", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result: { parts?: Part[]; error?: string } = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Spare parts could not be loaded.");
        if (!cancelled) setParts(result.parts ?? []);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Spare parts could not be loaded.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function addPart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const data = {
      name: formData.get("name"),
      partNumber: formData.get("partNumber"),
      quantity: Number(formData.get("quantity")),
      unitPrice: Number(formData.get("unitPrice")),
      reorderLevel: Number(formData.get("reorderLevel")),
      category: formData.get("category"),
      vehicleType: formData.get("vehicleType"),
    };
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/spare-parts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Spare part could not be added.");
        return;
      }
      form.reset();
      setSuccess("Spare part added.");
      await loadParts();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Spare part could not be added.");
    }
  }

  async function restock(event: FormEvent<HTMLFormElement>, partId: number) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/spare-parts/${partId}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: Number(values.get("quantity")), note: values.get("note") }),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Stock could not be replenished.");
      setRestockingId(null);
      setSuccess("Inventory replenished and ledger updated.");
      await loadParts();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Stock could not be replenished.");
    }
  }

  async function updateStock(event: FormEvent<HTMLFormElement>, part: Part) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const newQuantity = Number(values.get("quantity"));
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/inventory-transactions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ADJUST", partId: part.id, newQuantity }),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Stock quantity could not be updated.");
      setEditingStockId(null);
      setSuccess(`${part.name} stock quantity updated.`);
      await loadParts();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Stock quantity could not be updated.");
    }
  }

  async function updatePart(event: FormEvent<HTMLFormElement>, partId: number) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/spare-parts/${partId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          partNumber: values.partNumber,
          unitPrice: Number(values.unitPrice),
          reorderLevel: Number(values.reorderLevel),
          category: values.category,
          vehicleType: values.vehicleType,
        }),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Spare part could not be updated.");
      setEditingPartId(null);
      setSuccess("Spare part details updated.");
      await loadParts();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Spare part could not be updated.");
    }
  }

  async function deletePart(part: Part) {
    if (!window.confirm(`Delete ${part.name}? Parts with stock or service history cannot be removed.`)) return;
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/spare-parts/${part.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Spare part could not be deleted.");
      setSuccess("Spare part deleted.");
      await loadParts();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Spare part could not be deleted.");
    }
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <form onSubmit={addPart} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft md:grid-cols-2">
          <h2 className="text-xl font-black md:col-span-2">Add spare part</h2>
          <input name="name" required minLength={2} maxLength={255} placeholder="Part name" className="rounded-xl border border-slate-200 px-3 py-2" />
          <input name="partNumber" maxLength={100} placeholder="Part number (optional)" className="rounded-xl border border-slate-200 px-3 py-2" />
          <input name="category" required minLength={2} maxLength={100} placeholder="Category" className="rounded-xl border border-slate-200 px-3 py-2" />
          <select name="vehicleType" defaultValue="UNIVERSAL" className="rounded-xl border border-slate-200 px-3 py-2">
            <option value="CAR">Car</option><option value="BICYCLE">Bicycle</option><option value="MOTORBIKE">Motorbike</option><option value="UNIVERSAL">Universal</option>
          </select>
          <input name="quantity" required type="number" min="0" defaultValue="0" placeholder="Initial quantity" className="rounded-xl border border-slate-200 px-3 py-2" />
          <input name="unitPrice" required type="number" min="0.01" step="0.01" placeholder="Unit price (KSh)" className="rounded-xl border border-slate-200 px-3 py-2" />
          <input name="reorderLevel" required type="number" min="0" defaultValue={DEFAULT_REORDER_LEVEL} placeholder="Reorder level" className="rounded-xl border border-slate-200 px-3 py-2" />
          <button className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white">Add stock item</button>
        </form>
      )}

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="flex flex-col gap-3 p-4 sm:flex-row">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search parts or category" aria-label="Search parts or category" className="rounded-xl border border-slate-200 px-3 py-2 text-sm sm:w-72" />
          <select value={vehicleTypeFilter} onChange={(event) => setVehicleTypeFilter(event.target.value)} aria-label="Filter parts by vehicle type" className="rounded-xl border border-slate-200 px-3 py-2 text-sm sm:w-48">
            <option value="ALL">All vehicle types</option><option value="CAR">Car</option><option value="BICYCLE">Bicycle</option><option value="MOTORBIKE">Motorbike</option><option value="UNIVERSAL">Universal</option>
          </select>
        </div>
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3">Part</th>
              <th className="px-5 py-3">Type / category</th>
              <th className="px-5 py-3">Part number</th>
              <th className="px-5 py-3">In stock</th>
              <th className="px-5 py-3">Reorder at</th>
              <th className="px-5 py-3">Unit price</th>
              {canManage && <th className="px-5 py-3">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filteredParts.map((part) => (
              <tr key={part.id} className="border-t border-slate-200">
                {editingPartId === part.id ? (
                  <td colSpan={canManage ? 7 : 6} className="px-5 py-3">
                    <form onSubmit={(event) => void updatePart(event, part.id)} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <input name="name" defaultValue={part.name} required minLength={2} className="rounded-lg border border-slate-200 px-2 py-2" />
                      <input name="partNumber" defaultValue={part.partNumber ?? ""} placeholder="Part number" className="rounded-lg border border-slate-200 px-2 py-2" />
                      <input name="category" defaultValue={part.category} required minLength={2} maxLength={100} placeholder="Category" className="rounded-lg border border-slate-200 px-2 py-2" />
                      <select name="vehicleType" defaultValue={part.vehicleType} className="rounded-lg border border-slate-200 px-2 py-2">
                        <option value="CAR">Car</option><option value="BICYCLE">Bicycle</option><option value="MOTORBIKE">Motorbike</option><option value="UNIVERSAL">Universal</option>
                      </select>
                      <input name="unitPrice" type="number" min="0.01" step="0.01" defaultValue={Number(part.unitPrice)} required className="rounded-lg border border-slate-200 px-2 py-2" />
                      <input name="reorderLevel" type="number" min="0" defaultValue={part.reorderLevel || DEFAULT_REORDER_LEVEL} required className="rounded-lg border border-slate-200 px-2 py-2" />
                      <div className="flex gap-2">
                        <button className="rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white">Save</button>
                        <button type="button" onClick={() => setEditingPartId(null)} className="rounded-full border px-3 py-2 text-xs">Cancel</button>
                      </div>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="px-5 py-3 font-medium">{part.name}</td>
                    <td className="px-5 py-3">{part.vehicleType.toLowerCase()} · {part.category}</td>
                    <td className="px-5 py-3">{part.partNumber ?? "—"}</td>
                    <td className={`px-5 py-3 ${part.stockCounted && part.quantity <= part.reorderLevel ? "font-bold text-red-700" : ""}`}>
                      {editingStockId === part.id ? (
                        <form onSubmit={(event) => void updateStock(event, part)} className="flex min-w-40 flex-wrap items-center gap-2">
                          <input
                            name="quantity"
                            type="number"
                            min="0"
                            max="1000000"
                            required
                            autoFocus
                            defaultValue={part.stockCounted ? part.quantity : 0}
                            aria-label={`Parts remaining in stock for ${part.name}`}
                            className="w-24 rounded-lg border border-slate-200 px-2 py-1 font-normal"
                          />
                          <button className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">Save</button>
                          <button type="button" onClick={() => setEditingStockId(null)} className="text-xs font-normal text-slate-500">Cancel</button>
                        </form>
                      ) : part.stockCounted ? part.quantity : "Not counted"}
                    </td>
                    <td className="px-5 py-3">{part.stockCounted ? part.reorderLevel || DEFAULT_REORDER_LEVEL : "—"}</td>
                    <td className="px-5 py-3">{part.priceConfigured ? `KSh ${Number(part.unitPrice).toLocaleString()}` : "Price not set"}</td>
                    {canManage && (
                      <td className="px-5 py-3">
                        <div className="flex flex-col items-start gap-2">
                          <button type="button" onClick={() => setEditingPartId(part.id)} className="font-semibold text-orange-700">Edit details</button>
                          {editingStockId !== part.id && (
                            <button type="button" onClick={() => setEditingStockId(part.id)} className="font-semibold text-orange-700">
                              {part.stockCounted ? "Edit stock" : "Set stock count"}
                            </button>
                          )}
                          {restockingId === part.id ? (
                            <form onSubmit={(event) => void restock(event, part.id)} className="flex min-w-64 flex-wrap gap-2">
                              <input name="quantity" type="number" min="1" max="1000000" required placeholder="Qty to add" aria-label={`Quantity to restock ${part.name}`} className="w-24 rounded-lg border border-slate-200 px-2 py-1" />
                              <input name="note" maxLength={500} placeholder="Reason (optional)" aria-label={`Restock note for ${part.name}`} className="w-32 rounded-lg border border-slate-200 px-2 py-1" />
                              <button className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">Add</button>
                              <button type="button" onClick={() => setRestockingId(null)} className="text-xs text-slate-500">Cancel</button>
                            </form>
                          ) : (
                            <button type="button" disabled={!part.stockCounted} title={!part.stockCounted ? "Record a physical count before restocking." : undefined} onClick={() => setRestockingId(part.id)} className="font-semibold text-orange-700 disabled:cursor-not-allowed disabled:opacity-50">Restock</button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              disabled={part.quantity > 0}
                              title={part.quantity > 0 ? "Remove all stock before deleting." : "Delete unused spare part"}
                              onClick={() => void deletePart(part)}
                              className="font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </>
                )}
              </tr>
            ))}
            {filteredParts.length === 0 && <tr><td colSpan={canManage ? 7 : 6} className="px-5 py-5 text-slate-500">{parts.length ? "No parts match the selected filters." : "No spare parts in inventory."}</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
