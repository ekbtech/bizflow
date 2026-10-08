"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

type Appointment = {
  id: number;
  status: string;
  priority: string;
  appointmentDate: string;
  appointmentTime: string;
  description: string | null;
  customer: { name: string; phone: string };
  vehicle: { registrationNumber: string; make: string; model: string };
  service: { name: string };
  advisor: { id: number; name: string } | null;
  jobCard: { id: number; status: string; mechanic: { id: number; name: string } } | null;
};

type Mechanic = { id: number; name: string; status: string; specialization: string | null };
type Customer = { id: number; name: string };
type Vehicle = { id: number; customerId: number; registrationNumber: string; make: string; model: string };
type Service = { id: number; name: string };
type Advisor = { id: number; name: string };
type AppointmentAction = "CANCEL" | "NO_SHOW" | "START_SERVICE" | "RESCHEDULE";

export function AppointmentManager({ todayDate }: { todayDate: string }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [selectedMechanics, setSelectedMechanics] = useState<Record<number, number>>({});
  const [rescheduleValues, setRescheduleValues] = useState<Record<number, { date: string; time: string }>>({});
  const [reschedulingId, setReschedulingId] = useState<number | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  async function refreshAppointments() {
    const response = await fetch("/api/appointments", { credentials: "same-origin", cache: "no-store" });
    const result: { appointments?: Appointment[]; error?: string } = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Updated appointments could not be loaded.");
    setAppointments(result.appointments ?? []);
  }

  async function updateStatus(appointmentId: number, action: AppointmentAction) {
    setError("");
    setSuccess("");
    setBusyId(appointmentId);
    try {
      const values = rescheduleValues[appointmentId];
      const response = await fetch(`/api/appointments/${appointmentId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "RESCHEDULE" ? { action, ...values } : { action }),
      });
      const result: { error?: string; emailNotification?: { sent: boolean; reason: string } } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Appointment could not be updated.");
      const statusMessages: Record<AppointmentAction, string> = {
        CANCEL: `Appointment #${appointmentId} cancelled.`,
        NO_SHOW: `Appointment #${appointmentId} marked as a no-show.`,
        START_SERVICE: `Service started for appointment #${appointmentId}.`,
        RESCHEDULE: `Appointment #${appointmentId} rescheduled.`,
      };
      const statusMessage = statusMessages[action];
      setSuccess(result.emailNotification && !result.emailNotification.sent
        ? `${statusMessage} Customer email notification was not sent (${result.emailNotification.reason.replaceAll("_", " ")}).`
        : statusMessage);
      setReschedulingId(null);
      await refreshAppointments();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Appointment could not be updated.");
    } finally {
      setBusyId(null);
    }
  }

  async function createAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError("");
    setSuccess("");

    try {
      const advisorValue = formData.get("advisorUserId")?.toString() ?? "";
      const response = await fetch("/api/appointments", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: Number(formData.get("customerId")),
          vehicleId: Number(formData.get("vehicleId")),
          serviceId: Number(formData.get("serviceId")),
          date: formData.get("date"),
          time: formData.get("time"),
          description: formData.get("description"),
          priority: formData.get("priority"),
          advisorUserId: advisorValue ? Number(advisorValue) : null,
        }),
      });
      const result: { appointment?: { id: number }; error?: string; emailNotification?: { sent: boolean; reason: string } } = await response.json();
      if (!response.ok || !result.appointment) throw new Error(result.error ?? "Appointment could not be created.");
      setSuccess(result.emailNotification && !result.emailNotification.sent
        ? `Appointment #${result.appointment.id} created. Customer email notification was not sent (${result.emailNotification.reason.replaceAll("_", " ")}).`
        : `Appointment #${result.appointment.id} created.`);
      form.reset();
      setSelectedCustomerId(null);
      setShowCreateForm(false);
      await refreshAppointments();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Appointment could not be created.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/appointments", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/mechanics", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/customers", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/vehicles", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/services", { credentials: "same-origin", cache: "no-store" }),
    ])
      .then(async ([appointmentResponse, mechanicResponse, customerResponse, vehicleResponse, serviceResponse]) => {
        const [appointmentResult, mechanicResult, customerResult, vehicleResult, serviceResult]: [
          { appointments?: Appointment[]; advisors?: Advisor[]; error?: string },
          { mechanics?: Mechanic[]; error?: string },
          { customers?: Customer[]; error?: string },
          { vehicles?: Vehicle[]; error?: string },
          { services?: Service[]; error?: string },
        ] = await Promise.all([
          appointmentResponse.json(),
          mechanicResponse.json(),
          customerResponse.json(),
          vehicleResponse.json(),
          serviceResponse.json(),
        ]);
        if (!appointmentResponse.ok) throw new Error(appointmentResult.error ?? "Appointments could not be loaded.");
        if (!mechanicResponse.ok) throw new Error(mechanicResult.error ?? "Mechanics could not be loaded.");
        if (!customerResponse.ok) throw new Error(customerResult.error ?? "Customers could not be loaded.");
        if (!vehicleResponse.ok) throw new Error(vehicleResult.error ?? "Vehicles could not be loaded.");
        if (!serviceResponse.ok) throw new Error(serviceResult.error ?? "Services could not be loaded.");
        if (!cancelled) {
          setAppointments(appointmentResult.appointments ?? []);
          setMechanics(mechanicResult.mechanics ?? []);
          setCustomers(customerResult.customers ?? []);
          setVehicles(vehicleResult.vehicles ?? []);
          setServices(serviceResult.services ?? []);
          setAdvisors(appointmentResult.advisors ?? []);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Appointments could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function assign(appointmentId: number) {
    const mechanicId = selectedMechanics[appointmentId];
    if (!mechanicId) {
      setError("Choose a mechanic before assigning this appointment.");
      return;
    }
    setError("");
    setSuccess("");
    setBusyId(appointmentId);

    try {
      const response = await fetch(`/api/appointments/${appointmentId}/assign`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mechanicId }),
      });
      const result: { error?: string; emailNotification?: { sent: boolean; reason: string } } = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Appointment could not be assigned.");
        return;
      }
      setSuccess(result.emailNotification && !result.emailNotification.sent
        ? `Appointment #${appointmentId} confirmed and assigned. Customer email notification was not sent (${result.emailNotification.reason.replaceAll("_", " ")}).`
        : `Appointment #${appointmentId} confirmed and assigned.`);
      await refreshAppointments();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Appointment could not be assigned.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="rounded-xl bg-white p-5 text-sm text-slate-500">Loading appointments…</p>;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleAppointments = appointments.filter((appointment) =>
    !normalizedQuery || [
      appointment.customer.name,
      appointment.vehicle.registrationNumber,
      appointment.vehicle.make,
      appointment.vehicle.model,
      appointment.service.name,
      appointment.priority,
      appointment.advisor?.name ?? "",
      appointment.status,
    ].some((value) => value.toLowerCase().includes(normalizedQuery)),
  );

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
      <button type="button" onClick={() => setShowCreateForm((visible) => !visible)} className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-soft">
        {showCreateForm ? "Close appointment form" : "+ New Appointment"}
      </button>
      {showCreateForm && (
        <form onSubmit={(event) => void createAppointment(event)} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft sm:grid-cols-2 lg:grid-cols-4">
          <h2 className="text-lg font-bold sm:col-span-2 lg:col-span-4">Schedule appointment</h2>
          <select name="customerId" required defaultValue="" onChange={(event) => setSelectedCustomerId(Number(event.target.value) || null)} className="rounded-xl border border-slate-200 px-3 py-2">
            <option value="">Select customer</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
          <select name="vehicleId" required defaultValue="" disabled={!selectedCustomerId} className="rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-100">
            <option value="">Select vehicle</option>
            {vehicles.filter((vehicle) => vehicle.customerId === selectedCustomerId).map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>{vehicle.registrationNumber} · {vehicle.make} {vehicle.model}</option>
            ))}
          </select>
          <select name="serviceId" required defaultValue="" className="rounded-xl border border-slate-200 px-3 py-2">
            <option value="">Select service</option>
            {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
          </select>
          <select name="advisorUserId" defaultValue="" className="rounded-xl border border-slate-200 px-3 py-2">
            <option value="">Assign to me</option>
            {advisors.map((advisor) => <option key={advisor.id} value={advisor.id}>{advisor.name}</option>)}
          </select>
          <input name="date" type="date" required min={todayDate} aria-label="Appointment date" className="rounded-xl border border-slate-200 px-3 py-2" />
          <input name="time" type="time" required aria-label="Appointment time" className="rounded-xl border border-slate-200 px-3 py-2" />
          <select name="priority" defaultValue="NORMAL" aria-label="Appointment priority" className="rounded-xl border border-slate-200 px-3 py-2">
            {["LOW", "NORMAL", "HIGH", "URGENT"].map((priority) => <option key={priority} value={priority}>{priority}</option>)}
          </select>
          <textarea name="description" maxLength={2000} placeholder="Customer complaint or appointment notes" className="min-h-10 rounded-xl border border-slate-200 px-3 py-2 sm:col-span-2 lg:col-span-3" />
          <button disabled={!customers.length || !vehicles.length || !services.length} className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">Save appointment</button>
        </form>
      )}
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer, vehicle, service, or status" aria-label="Search appointments" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm sm:max-w-sm" />
      {visibleAppointments.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{appointments.length ? "No appointments match your search." : "No appointment requests yet."}</p>}
      {visibleAppointments.map((appointment) => (
        <article key={appointment.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-orange-600">Appointment #{appointment.id}</p>
              <h2 className="mt-1 text-lg font-bold">{appointment.customer.name} · {appointment.vehicle.make} {appointment.vehicle.model}</h2>
              <p className="text-sm text-slate-600">{appointment.vehicle.registrationNumber} · {appointment.service.name}</p>
              <p className="mt-1 text-sm text-slate-500">{new Date(appointment.appointmentDate).toLocaleDateString()} · {new Date(appointment.appointmentTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: "UTC" })} · {appointment.customer.phone}</p>
              {appointment.description && <p className="mt-2 text-sm text-slate-600">Complaint: {appointment.description}</p>}
              <p className="mt-1 text-xs font-semibold text-slate-500">Priority: {appointment.priority.toLowerCase()} · Advisor: {appointment.advisor?.name ?? "Unassigned"}</p>
              {appointment.jobCard && (
                <p className="mt-2 text-sm font-medium text-emerald-700">
                  Job JC-{appointment.jobCard.id} · {appointment.jobCard.status.toLowerCase()} · {appointment.jobCard.mechanic.name}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap md:min-w-72 md:flex-col">
              {["REQUESTED", "CONFIRMED", "CHECKED_IN"].includes(appointment.status) && (
                <>
                  <select
                    value={selectedMechanics[appointment.id] ?? appointment.jobCard?.mechanic.id ?? ""}
                    onChange={(event) => setSelectedMechanics((current) => ({ ...current, [appointment.id]: Number(event.target.value) }))}
                    disabled={mechanics.length === 0}
                    aria-label={`Mechanic for appointment ${appointment.id}`}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">{mechanics.length === 0 ? "Create a mechanic account first" : "Select mechanic"}</option>
                    {mechanics.map((mechanic) => (
                      <option key={mechanic.id} value={mechanic.id}>
                        {mechanic.name} · {mechanic.specialization ?? mechanic.status}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void assign(appointment.id)}
                    disabled={busyId === appointment.id || mechanics.length === 0}
                    className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busyId === appointment.id ? "Assigning…" : appointment.jobCard ? "Reassign job" : "Confirm & assign"}
                  </button>
                </>
              )}
              {["REQUESTED", "CONFIRMED"].includes(appointment.status) && !appointment.jobCard && (
                <>
                  {reschedulingId === appointment.id ? (
                    <>
                      <input
                        aria-label={`New date for appointment ${appointment.id}`}
                        type="date"
                        min={todayDate}
                        value={rescheduleValues[appointment.id]?.date ?? ""}
                        onChange={(event) => setRescheduleValues((current) => ({ ...current, [appointment.id]: { date: event.target.value, time: current[appointment.id]?.time ?? "" } }))}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                      <input
                        aria-label={`New time for appointment ${appointment.id}`}
                        type="time"
                        value={rescheduleValues[appointment.id]?.time ?? ""}
                        onChange={(event) => setRescheduleValues((current) => ({ ...current, [appointment.id]: { date: current[appointment.id]?.date ?? "", time: event.target.value } }))}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                      <button type="button" onClick={() => void updateStatus(appointment.id, "RESCHEDULE")} disabled={busyId === appointment.id || !rescheduleValues[appointment.id]?.date || !rescheduleValues[appointment.id]?.time} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Save new time</button>
                      <button type="button" onClick={() => setReschedulingId(null)} className="text-sm text-slate-500">Cancel reschedule</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setReschedulingId(appointment.id)} disabled={busyId === appointment.id} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Reschedule</button>
                  )}
                  <button type="button" onClick={() => void updateStatus(appointment.id, "NO_SHOW")} disabled={busyId === appointment.id} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Mark no-show</button>
                  <button type="button" onClick={() => void updateStatus(appointment.id, "CANCEL")} disabled={busyId === appointment.id} className="rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Cancel appointment</button>
                </>
              )}
              {["REQUESTED", "CONFIRMED"].includes(appointment.status) && (
                <Link href={`/receptions?appointmentId=${appointment.id}`} className="rounded-full border border-slate-300 px-4 py-2 text-center text-sm font-semibold">Record reception / check in</Link>
              )}
              {appointment.status === "CHECKED_IN" && (
                <button type="button" onClick={() => void updateStatus(appointment.id, "START_SERVICE")} disabled={busyId === appointment.id || !appointment.jobCard} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Start service</button>
              )}
              <span className="text-xs font-medium uppercase text-slate-500">Status: {appointment.status.replaceAll("_", " ").toLowerCase()}</span>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
