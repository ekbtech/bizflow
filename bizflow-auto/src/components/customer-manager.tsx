"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type Customer = {
  id: number;
  name: string;
  phone: string;
  whatsappOptIn: boolean;
  email: string | null;
  address: string | null;
  _count?: { vehicles: number };
};

export function CustomerManager({ canWrite, canDelete }: { canWrite: boolean; canDelete: boolean }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadCustomers() {
    const response = await fetch("/api/customers", { credentials: "same-origin", cache: "no-store" });
    const result: { customers?: Customer[]; error?: string } = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Customers could not be loaded.");
    setCustomers(result.customers ?? []);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/customers", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result: { customers?: Customer[]; error?: string } = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Customers could not be loaded.");
        if (active) setCustomers(result.customers ?? []);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Customers could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const visibleCustomers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return customers;
    return customers.filter((customer) =>
      [customer.name, customer.phone, customer.email, customer.address]
        .some((value) => value?.toLowerCase().includes(normalized)),
    );
  }, [customers, query]);

  async function saveCustomer(event: FormEvent<HTMLFormElement>, id?: number) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const values = {
      ...Object.fromEntries(formData.entries()),
      whatsappOptIn: formData.has("whatsappOptIn"),
    };
    setError("");
    setSuccess("");
    try {
      const response = await fetch(id ? `/api/customers/${id}` : "/api/customers", {
        method: id ? "PATCH" : "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result: { error?: string } = response.status === 204 ? {} : await response.json();
      if (!response.ok) throw new Error(result.error ?? "Customer could not be saved.");
      setEditingId(null);
      if (!id) form.reset();
      setSuccess(id ? "Customer updated." : "Customer added.");
      await loadCustomers();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Customer could not be saved.");
    }
  }

  async function deleteCustomer(id: number) {
    if (!window.confirm("Delete this customer? Customers with linked records cannot be deleted.")) return;
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/customers/${id}`, { method: "DELETE", credentials: "same-origin" });
      if (!response.ok) {
        const result: { error?: string } = await response.json();
        throw new Error(result.error ?? "Customer could not be deleted.");
      }
      setSuccess("Customer deleted.");
      await loadCustomers();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Customer could not be deleted.");
    }
  }

  return (
    <div className="space-y-5">
      {canWrite && (
        <form onSubmit={(event) => void saveCustomer(event)} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft md:grid-cols-2">
          <h2 className="text-lg font-bold md:col-span-2">Add customer</h2>
          <input name="name" required minLength={2} maxLength={255} placeholder="Customer name" className="rounded-xl border border-slate-200 px-3 py-2" />
          <input name="phone" required minLength={5} maxLength={50} type="tel" placeholder="Phone number" className="rounded-xl border border-slate-200 px-3 py-2" />
          <input name="email" type="email" maxLength={255} placeholder="Email (optional)" className="rounded-xl border border-slate-200 px-3 py-2" />
          <input name="address" maxLength={255} placeholder="Address (optional)" className="rounded-xl border border-slate-200 px-3 py-2" />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input name="whatsappOptIn" type="checkbox" className="accent-orange-500" />
            WhatsApp and SMS reminders opt-in confirmed
          </label>
          <button className="w-fit rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white">Save customer</button>
        </form>
      )}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-black">Customers ({customers.length})</h2>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, phone, email, or address" aria-label="Search customers" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm sm:max-w-sm" />
      </div>
      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Address</th><th className="px-4 py-3">Reminders</th><th className="px-4 py-3">Vehicles</th>{(canWrite || canDelete) && <th className="px-4 py-3">Actions</th>}</tr>
          </thead>
          <tbody>
            {visibleCustomers.map((customer) => (
              <tr key={customer.id} className="border-t border-slate-200">
                {editingId === customer.id ? (
                  <td colSpan={canWrite || canDelete ? 7 : 6} className="px-4 py-3">
                    <form onSubmit={(event) => void saveCustomer(event, customer.id)} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                      <input name="name" required minLength={2} defaultValue={customer.name} className="rounded-lg border px-2 py-2" />
                      <input name="phone" required minLength={5} defaultValue={customer.phone} className="rounded-lg border px-2 py-2" />
                      <input name="email" type="email" defaultValue={customer.email ?? ""} className="rounded-lg border px-2 py-2" />
                      <input name="address" defaultValue={customer.address ?? ""} className="rounded-lg border px-2 py-2" />
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input name="whatsappOptIn" type="checkbox" defaultChecked={customer.whatsappOptIn} className="accent-orange-500" />
                        Customer has opted in to both channels
                      </label>
                      <div className="flex gap-2">
                        <button className="rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white">Save</button>
                        <button type="button" onClick={() => setEditingId(null)} className="rounded-full border px-3 py-2 text-xs">Cancel</button>
                      </div>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3 font-semibold">{customer.name}</td>
                    <td className="px-4 py-3">{customer.phone}</td>
                    <td className="px-4 py-3">{customer.email ?? "—"}</td>
                    <td className="px-4 py-3">{customer.address ?? "—"}</td>
                    <td className="px-4 py-3">{customer.whatsappOptIn ? "Opted in" : "Not opted in"}</td>
                    <td className="px-4 py-3">{customer._count?.vehicles ?? 0}</td>
                    {(canWrite || canDelete) && (
                      <td className="space-x-3 whitespace-nowrap px-4 py-3">
                        {canWrite && <button type="button" onClick={() => setEditingId(customer.id)} className="font-semibold text-orange-700">Edit</button>}
                        {canDelete && <button type="button" onClick={() => void deleteCustomer(customer.id)} className="font-semibold text-red-700">Delete</button>}
                      </td>
                    )}
                  </>
                )}
              </tr>
            ))}
            {!loading && visibleCustomers.length === 0 && <tr><td colSpan={canWrite || canDelete ? 7 : 6} className="px-4 py-8 text-center text-slate-500">No customers match your search.</td></tr>}
            {loading && <tr><td colSpan={canWrite || canDelete ? 7 : 6} className="px-4 py-8 text-center text-slate-500">Loading customers…</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
