"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { VehicleMakeModelFields } from "@/components/vehicle-make-model-fields";

type CustomerOption = { id: number; name: string };
type Vehicle = {
  id: number;
  registrationNumber: string;
  make: string;
  model: string;
  year: number;
  color: string | null;
  mileage: number;
  customerId: number;
  customer: { id: number; name: string; phone: string };
};

export function VehicleManager({ canWrite, canDelete, maxVehicleYear }: { canWrite: boolean; canDelete: boolean; maxVehicleYear: number }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadVehicles() {
    const response = await fetch("/api/vehicles", { credentials: "same-origin", cache: "no-store" });
    const result: { vehicles?: Vehicle[]; error?: string } = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Vehicles could not be loaded.");
    setVehicles(result.vehicles ?? []);
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/vehicles", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/customers", { credentials: "same-origin", cache: "no-store" }),
    ])
      .then(async ([vehicleResponse, customerResponse]) => {
        const [vehicleResult, customerResult]: [
          { vehicles?: Vehicle[]; error?: string },
          { customers?: CustomerOption[]; error?: string },
        ] = await Promise.all([vehicleResponse.json(), customerResponse.json()]);
        if (!vehicleResponse.ok) throw new Error(vehicleResult.error ?? "Vehicles could not be loaded.");
        if (!customerResponse.ok) throw new Error(customerResult.error ?? "Customers could not be loaded.");
        if (active) {
          setVehicles(vehicleResult.vehicles ?? []);
          setCustomers(customerResult.customers ?? []);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Vehicle data could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const visibleVehicles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return vehicles;
    return vehicles.filter((vehicle) =>
      [vehicle.registrationNumber, vehicle.make, vehicle.model, vehicle.customer.name, vehicle.customer.phone]
        .some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [vehicles, query]);

  async function saveVehicle(event: FormEvent<HTMLFormElement>, id?: number) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const payload = {
      ...values,
      customerId: Number(values.customerId),
      year: Number(values.year),
      mileage: Number(values.mileage),
    };
    setError("");
    setSuccess("");
    try {
      const response = await fetch(id ? `/api/vehicles/${id}` : "/api/vehicles", {
        method: id ? "PATCH" : "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Vehicle could not be saved.");
      setEditingId(null);
      if (!id) form.reset();
      setSuccess(id ? "Vehicle updated." : "Vehicle added.");
      await loadVehicles();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Vehicle could not be saved.");
    }
  }

  async function deleteVehicle(id: number) {
    if (!window.confirm("Delete this vehicle? Vehicles with linked service records cannot be deleted.")) return;
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/vehicles/${id}`, { method: "DELETE", credentials: "same-origin" });
      if (!response.ok) {
        const result: { error?: string } = await response.json();
        throw new Error(result.error ?? "Vehicle could not be deleted.");
      }
      setSuccess("Vehicle deleted.");
      await loadVehicles();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Vehicle could not be deleted.");
    }
  }

  function formFields(vehicle?: Vehicle) {
    return (
      <>
        <select name="customerId" required defaultValue={vehicle?.customerId ?? ""} className="rounded-xl border border-slate-200 px-3 py-2">
          <option value="" disabled>Select customer</option>
          {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
        </select>
        <input name="registrationNumber" required minLength={2} maxLength={50} defaultValue={vehicle?.registrationNumber} placeholder="Registration number" className="rounded-xl border border-slate-200 px-3 py-2" />
        <VehicleMakeModelFields make={vehicle?.make} model={vehicle?.model} />
        <input name="year" required type="number" min="1886" max={maxVehicleYear} defaultValue={vehicle?.year} placeholder="Year" className="rounded-xl border border-slate-200 px-3 py-2" />
        <input name="color" maxLength={50} defaultValue={vehicle?.color ?? ""} placeholder="Color (optional)" className="rounded-xl border border-slate-200 px-3 py-2" />
        <input name="mileage" required type="number" min="0" max="2000000" defaultValue={vehicle?.mileage ?? 0} placeholder="Mileage (km)" className="rounded-xl border border-slate-200 px-3 py-2" />
      </>
    );
  }

  return (
    <div className="space-y-5">
      {canWrite && (
        <form onSubmit={(event) => void saveVehicle(event)} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft sm:grid-cols-2 lg:grid-cols-4">
          <h2 className="text-lg font-bold sm:col-span-2 lg:col-span-4">Add vehicle</h2>
          {formFields()}
          <button disabled={customers.length === 0} className="w-fit rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {customers.length ? "Save vehicle" : "Add a customer first"}
          </button>
        </form>
      )}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-black">Vehicles ({vehicles.length})</h2>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search registration, make, model, or owner" aria-label="Search vehicles" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm sm:max-w-sm" />
      </div>
      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr><th className="px-4 py-3">Registration</th><th className="px-4 py-3">Vehicle</th><th className="px-4 py-3">Year / Color</th><th className="px-4 py-3">Mileage</th><th className="px-4 py-3">Owner</th>{(canWrite || canDelete) && <th className="px-4 py-3">Actions</th>}</tr>
          </thead>
          <tbody>
            {visibleVehicles.map((vehicle) => (
              <tr key={vehicle.id} className="border-t border-slate-200">
                {editingId === vehicle.id ? (
                  <td colSpan={canWrite || canDelete ? 6 : 5} className="px-4 py-3">
                    <form onSubmit={(event) => void saveVehicle(event, vehicle.id)} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {formFields(vehicle)}
                      <button className="rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white">Save</button>
                      <button type="button" onClick={() => setEditingId(null)} className="rounded-full border px-3 py-2 text-xs">Cancel</button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3 font-semibold"><Link href={`/vehicles/${vehicle.id}`} className="text-orange-700 hover:underline">{vehicle.registrationNumber}</Link></td>
                    <td className="px-4 py-3">{vehicle.make} {vehicle.model}</td>
                    <td className="px-4 py-3">{vehicle.year}{vehicle.color ? ` · ${vehicle.color}` : ""}</td>
                    <td className="px-4 py-3">{vehicle.mileage.toLocaleString()} km</td>
                    <td className="px-4 py-3">{vehicle.customer.name}</td>
                    {(canWrite || canDelete) && (
                      <td className="space-x-3 whitespace-nowrap px-4 py-3">
                        {canWrite && <button type="button" onClick={() => setEditingId(vehicle.id)} className="font-semibold text-orange-700">Edit</button>}
                        {canDelete && <button type="button" onClick={() => void deleteVehicle(vehicle.id)} className="font-semibold text-red-700">Delete</button>}
                      </td>
                    )}
                  </>
                )}
              </tr>
            ))}
            {!loading && visibleVehicles.length === 0 && <tr><td colSpan={canWrite || canDelete ? 6 : 5} className="px-4 py-8 text-center text-slate-500">No vehicles match your search.</td></tr>}
            {loading && <tr><td colSpan={canWrite || canDelete ? 6 : 5} className="px-4 py-8 text-center text-slate-500">Loading vehicles…</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
