"use client";

import { useEffect, useState, type FormEvent } from "react";

type Appointment = {
  id: number;
  status: string;
  customer: { id: number; name: string };
  vehicle: { id: number; registrationNumber: string; make: string; model: string };
  service: { id: number; name: string };
};

type Customer = { id: number; name: string; phone: string };
type Vehicle = { id: number; customerId: number; registrationNumber: string; make: string; model: string; mileage: number };
type Service = { id: number; name: string };
type Reception = {
  id: number;
  receptionNumber: string;
  mileage: number;
  fuelLevelPercent: number;
  complaint: string;
  createdAt: string;
  customer: { id: number; name: string; phone: string };
  vehicle: { id: number; registrationNumber: string; make: string; model: string };
  receivedBy: { name: string };
  images: { id: number; fileName: string; mimeType: string; sizeBytes: number }[];
};

export function ReceptionManager({ initialAppointmentId }: { initialAppointmentId: number | null }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [receptions, setReceptions] = useState<Reception[]>([]);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<number | null>(initialAppointmentId);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadReceptions() {
    const response = await fetch("/api/receptions", { credentials: "same-origin", cache: "no-store" });
    const result: { receptions?: Reception[]; error?: string } = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Reception records could not be loaded.");
    setReceptions(result.receptions ?? []);
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/appointments", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/customers", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/vehicles", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/services", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/receptions", { credentials: "same-origin", cache: "no-store" }),
    ])
      .then(async ([appointmentResponse, customerResponse, vehicleResponse, serviceResponse, receptionResponse]) => {
        const [appointmentResult, customerResult, vehicleResult, serviceResult, receptionResult]: [
          { appointments?: Appointment[]; error?: string },
          { customers?: Customer[]; error?: string },
          { vehicles?: Vehicle[]; error?: string },
          { services?: Service[]; error?: string },
          { receptions?: Reception[]; error?: string },
        ] = await Promise.all([
          appointmentResponse.json(),
          customerResponse.json(),
          vehicleResponse.json(),
          serviceResponse.json(),
          receptionResponse.json(),
        ]);
        if (!appointmentResponse.ok) throw new Error(appointmentResult.error ?? "Appointments could not be loaded.");
        if (!customerResponse.ok) throw new Error(customerResult.error ?? "Customers could not be loaded.");
        if (!vehicleResponse.ok) throw new Error(vehicleResult.error ?? "Vehicles could not be loaded.");
        if (!serviceResponse.ok) throw new Error(serviceResult.error ?? "Services could not be loaded.");
        if (!receptionResponse.ok) throw new Error(receptionResult.error ?? "Reception records could not be loaded.");
        if (active) {
          const availableAppointments = (appointmentResult.appointments ?? []).filter((appointment) =>
            appointment.status === "REQUESTED" || appointment.status === "CONFIRMED",
          );
          setAppointments(availableAppointments);
          setCustomers(customerResult.customers ?? []);
          setVehicles(vehicleResult.vehicles ?? []);
          setServices(serviceResult.services ?? []);
          setReceptions(receptionResult.receptions ?? []);
          const initialAppointment = availableAppointments.find((appointment) => appointment.id === initialAppointmentId);
          if (initialAppointment) {
            setSelectedCustomerId(initialAppointment.customer.id);
            setSelectedVehicleId(initialAppointment.vehicle.id);
            setSelectedServiceId(initialAppointment.service.id);
          } else if (initialAppointmentId !== null) {
            setError("That appointment is no longer available to check in.");
          }
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Reception data could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialAppointmentId]);

  function chooseAppointment(value: string) {
    const appointmentId = Number(value) || null;
    setSelectedAppointmentId(appointmentId);
    const appointment = appointments.find((item) => item.id === appointmentId);
    setSelectedCustomerId(appointment?.customer.id ?? null);
    setSelectedVehicleId(appointment?.vehicle.id ?? null);
    setSelectedServiceId(appointment?.service.id ?? null);
  }

  async function submitReception(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const selectedAppointment = appointments.find((appointment) => appointment.id === selectedAppointmentId);
    const customerId = selectedAppointment?.customer.id ?? selectedCustomerId;
    const vehicleId = selectedAppointment?.vehicle.id ?? selectedVehicleId;
    const serviceId = selectedAppointment?.service.id ?? selectedServiceId;
    if (!customerId || !vehicleId || (!selectedAppointmentId && !serviceId)) {
      setError("Select a customer, vehicle, and service for a walk-in reception.");
      return;
    }

    const submission = new FormData();
    submission.set("appointmentId", selectedAppointmentId ? String(selectedAppointmentId) : "");
    submission.set("customerId", String(customerId));
    submission.set("vehicleId", String(vehicleId));
    submission.set("serviceId", serviceId ? String(serviceId) : "");
    for (const key of ["mileage", "fuelLevelPercent", "exteriorCondition", "interiorCondition", "tyres", "lights", "windows", "mirrors", "bodyDamage", "existingScratches", "accessories", "complaint"]) {
      const value = values.get(key);
      if (value !== null) submission.set(key, value);
    }
    for (const photo of values.getAll("photos")) {
      if (photo instanceof File && photo.size > 0) submission.append("photos", photo);
    }

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/receptions", {
        method: "POST",
        credentials: "same-origin",
        body: submission,
      });
      const result: { reception?: { receptionNumber: string }; error?: string } = await response.json();
      if (!response.ok || !result.reception) throw new Error(result.error ?? "Vehicle reception could not be completed.");
      setSuccess(`${result.reception.receptionNumber} recorded. The appointment is now checked in.`);
      form.reset();
      setSelectedAppointmentId(null);
      setSelectedCustomerId(null);
      setSelectedVehicleId(null);
      setSelectedServiceId(null);
      await loadReceptions();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Vehicle reception could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="rounded-xl bg-white p-5 text-sm text-slate-500">Loading reception data…</p>;

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}

      <form onSubmit={(event) => void submitReception(event)} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-3">
          <h2 className="text-xl font-black">Receive vehicle</h2>
          <p className="mt-1 text-sm text-slate-500">Check in a confirmed booking or register a walk-in vehicle reception.</p>
        </div>
        <label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-3">
          Existing appointment (optional)
          <select value={selectedAppointmentId ?? ""} onChange={(event) => chooseAppointment(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2">
            <option value="">Walk-in / no existing appointment</option>
            {appointments.map((appointment) => (
              <option key={appointment.id} value={appointment.id}>
                #{appointment.id} · {appointment.customer.name} · {appointment.vehicle.registrationNumber} · {appointment.status.toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Customer
          <select required value={selectedCustomerId ?? ""} onChange={(event) => {
            setSelectedCustomerId(Number(event.target.value) || null);
            setSelectedVehicleId(null);
          }} disabled={Boolean(selectedAppointmentId)} className="rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-100">
            <option value="">Select customer</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Vehicle
          <select required value={selectedVehicleId ?? ""} onChange={(event) => setSelectedVehicleId(Number(event.target.value) || null)} disabled={Boolean(selectedAppointmentId) || !selectedCustomerId} className="rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-100">
            <option value="">Select vehicle</option>
            {vehicles.filter((vehicle) => vehicle.customerId === selectedCustomerId).map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>{vehicle.registrationNumber} · {vehicle.make} {vehicle.model}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Service
          <select required={!selectedAppointmentId} value={selectedServiceId ?? ""} onChange={(event) => setSelectedServiceId(Number(event.target.value) || null)} disabled={Boolean(selectedAppointmentId)} className="rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-100">
            <option value="">Select service</option>
            {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Mileage (km)
          <input key={selectedVehicleId ?? "no-vehicle"} name="mileage" required type="number" min="0" max="2000000" defaultValue={selectedVehicleId ? vehicles.find((vehicle) => vehicle.id === selectedVehicleId)?.mileage : undefined} className="rounded-xl border border-slate-200 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Fuel level (%)
          <input name="fuelLevelPercent" required type="number" min="0" max="100" defaultValue="50" className="rounded-xl border border-slate-200 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-3">
          Customer complaint
          <textarea name="complaint" required minLength={2} maxLength={5000} className="min-h-20 rounded-xl border border-slate-200 px-3 py-2" />
        </label>
        {([
          ["exteriorCondition", "Exterior condition"],
          ["interiorCondition", "Interior condition"],
          ["tyres", "Tyres"],
          ["lights", "Lights"],
          ["windows", "Windows"],
          ["mirrors", "Mirrors"],
          ["bodyDamage", "Body damage"],
          ["existingScratches", "Existing scratches"],
          ["accessories", "Accessories"],
        ] as const).map(([name, label]) => (
          <label key={name} className="grid gap-1 text-sm font-medium text-slate-700">
            {label}
            <textarea name={name} maxLength={2000} className="min-h-16 rounded-xl border border-slate-200 px-3 py-2" />
          </label>
        ))}
        <label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-3">
          Vehicle photos (JPEG, PNG, or WebP; max 5 images / 15 MB total)
          <input name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <button disabled={busy || !customers.length || !vehicles.length || (!selectedAppointmentId && !services.length)} className="w-fit rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Saving reception…" : "Record reception"}
        </button>
      </form>

      <section className="space-y-3">
        <h2 className="text-xl font-black">Recent receptions</h2>
        {receptions.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">No vehicle receptions recorded yet.</p>}
        {receptions.map((reception) => (
          <article key={reception.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-orange-600">{reception.receptionNumber}</p>
                <h3 className="mt-1 font-bold">{reception.vehicle.make} {reception.vehicle.model} · {reception.vehicle.registrationNumber}</h3>
                <p className="text-sm text-slate-600">{reception.customer.name} · {reception.customer.phone}</p>
                <p className="mt-1 text-sm text-slate-500">{new Date(reception.createdAt).toLocaleString()} · received by {reception.receivedBy.name}</p>
              </div>
              <p className="text-sm text-slate-600">{reception.mileage.toLocaleString()} km · {reception.fuelLevelPercent}% fuel</p>
            </div>
            <p className="mt-3 text-sm"><strong>Complaint:</strong> {reception.complaint}</p>
            {reception.images.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-sm">
                {reception.images.map((image) => (
                  <li key={image.id}>
                    <a href={`/api/receptions/${reception.id}/images/${image.id}`} target="_blank" rel="noreferrer" className="font-semibold text-orange-700 hover:underline">
                      View {image.fileName}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
