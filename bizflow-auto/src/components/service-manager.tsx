"use client";

import { useEffect, useState, type FormEvent } from "react";

type VehicleType = "CAR" | "BICYCLE" | "MOTORBIKE" | "UNIVERSAL";
type Service = {
  id: number;
  name: string;
  price: number | string;
  priceConfigured: boolean;
  category: string;
  vehicleType: VehicleType;
  mechanicSpecialty: string;
};

const vehicleTypes: { value: VehicleType; label: string }[] = [
  { value: "CAR", label: "Car" },
  { value: "BICYCLE", label: "Bicycle" },
  { value: "MOTORBIKE", label: "Motorbike" },
  { value: "UNIVERSAL", label: "Universal" },
];

export function ServiceManager({ canWrite, canDelete }: { canWrite: boolean; canDelete: boolean }) {
  const [services, setServices] = useState<Service[]>([]);
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState("ALL");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const filteredServices = services.filter((service) => {
    const matchesType = vehicleTypeFilter === "ALL" || service.vehicleType === vehicleTypeFilter;
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery = !normalizedQuery || [service.name, service.category, service.mechanicSpecialty]
      .some((value) => value.toLowerCase().includes(normalizedQuery));
    return matchesType && matchesQuery;
  });

  async function loadServices() {
    const response = await fetch("/api/services", { credentials: "same-origin", cache: "no-store" });
    const result: { services?: Service[]; error?: string } = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Services could not be loaded.");
    setServices(result.services ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/services", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result: { services?: Service[]; error?: string } = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Services could not be loaded.");
        if (!cancelled) setServices(result.services ?? []);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Services could not be loaded.");
      });
    return () => { cancelled = true; };
  }, []);

  async function addService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/services", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, price: Number(data.price) }),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Service could not be added.");
        return;
      }
      form.reset();
      setSuccess("Service added.");
      await loadServices();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Service could not be added.");
    }
  }

  async function updateService(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/services/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          price: Number(formData.get("price")),
          category: formData.get("category"),
          vehicleType: formData.get("vehicleType"),
          mechanicSpecialty: formData.get("mechanicSpecialty"),
        }),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Service could not be updated.");
        return;
      }
      setEditingServiceId(null);
      setSuccess("Service updated.");
      await loadServices();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Service could not be updated.");
    }
  }

  async function deleteService(id: number) {
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/services/${id}`, { method: "DELETE", credentials: "same-origin" });
      if (!response.ok) {
        const result: { error?: string } = await response.json();
        setError(result.error ?? "Service could not be deleted.");
        return;
      }
      setSuccess("Service deleted.");
      await loadServices();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Service could not be deleted.");
    }
  }

  return (
    <div className="space-y-6">
      {canWrite && (
        <form onSubmit={addService} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft sm:grid-cols-2 lg:grid-cols-3">
          <input name="name" required minLength={2} maxLength={255} placeholder="Service name" className="rounded-xl border border-slate-200 px-3 py-2" />
          <input name="category" required minLength={2} maxLength={100} placeholder="Category (e.g. Brakes)" className="rounded-xl border border-slate-200 px-3 py-2" />
          <select name="vehicleType" defaultValue="UNIVERSAL" className="rounded-xl border border-slate-200 px-3 py-2">
            {vehicleTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
          <input name="mechanicSpecialty" required minLength={2} maxLength={120} placeholder="Mechanic specialty" className="rounded-xl border border-slate-200 px-3 py-2" />
          <input name="price" required type="number" min="0.01" step="0.01" placeholder="Price (KSh)" className="rounded-xl border border-slate-200 px-3 py-2" />
          <button className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white">Add service</button>
        </form>
      )}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="flex flex-col gap-3 p-4 sm:flex-row">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search service or mechanic" aria-label="Search services or mechanic specialties" className="rounded-xl border border-slate-200 px-3 py-2 text-sm sm:w-72" />
          <select value={vehicleTypeFilter} onChange={(event) => setVehicleTypeFilter(event.target.value)} aria-label="Filter services by vehicle type" className="rounded-xl border border-slate-200 px-3 py-2 text-sm sm:w-48">
            <option value="ALL">All vehicle types</option>{vehicleTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </div>
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3">Service</th><th className="px-5 py-3">Vehicle / category</th>
              <th className="px-5 py-3">Mechanic</th><th className="px-5 py-3">Price</th>
              {(canWrite || canDelete) && <th className="px-5 py-3">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filteredServices.map((service) => (
              <tr key={service.id} className="border-t border-slate-200">
                {editingServiceId === service.id ? (
                  <td colSpan={canWrite || canDelete ? 5 : 4} className="px-5 py-3">
                    <form onSubmit={(event) => updateService(event, service.id)} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      <input name="name" required minLength={2} maxLength={255} defaultValue={service.name} className="rounded-xl border border-slate-200 px-3 py-2" />
                      <input name="category" required minLength={2} maxLength={100} defaultValue={service.category} className="rounded-xl border border-slate-200 px-3 py-2" />
                      <select name="vehicleType" defaultValue={service.vehicleType} className="rounded-xl border border-slate-200 px-3 py-2">
                        {vehicleTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                      </select>
                      <input name="mechanicSpecialty" required minLength={2} maxLength={120} defaultValue={service.mechanicSpecialty} className="rounded-xl border border-slate-200 px-3 py-2" />
                      <input name="price" required type="number" min="0.01" step="0.01" defaultValue={Number(service.price)} className="rounded-xl border border-slate-200 px-3 py-2" />
                      <div className="flex gap-2">
                        <button className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Save</button>
                        <button type="button" onClick={() => setEditingServiceId(null)} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold">Cancel</button>
                      </div>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="px-5 py-3 font-medium">{service.name}</td>
                    <td className="px-5 py-3">{service.vehicleType.toLowerCase()} · {service.category}</td>
                    <td className="px-5 py-3">{service.mechanicSpecialty}</td>
                    <td className="px-5 py-3">{service.priceConfigured ? `KSh ${Number(service.price).toLocaleString()}` : "Price not set"}</td>
                    {(canWrite || canDelete) && (
                      <td className="space-x-3 px-5 py-3">
                        {canWrite && <button type="button" onClick={() => setEditingServiceId(service.id)} className="font-semibold text-orange-700">Edit</button>}
                        {canDelete && <button type="button" onClick={() => void deleteService(service.id)} className="font-semibold text-red-700">Delete</button>}
                      </td>
                    )}
                  </>
                )}
              </tr>
            ))}
            {filteredServices.length === 0 && <tr><td colSpan={canWrite || canDelete ? 5 : 4} className="px-5 py-5 text-slate-500">{services.length ? "No services match the selected filters." : "No services have been added yet."}</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
