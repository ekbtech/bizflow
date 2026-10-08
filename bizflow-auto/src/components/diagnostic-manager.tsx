"use client";

import { useEffect, useState, type FormEvent } from "react";

type Appointment = {
  id: number;
  status: string;
  appointmentDate: string;
  appointmentTime: string;
  customer: { name: string };
  vehicle: { registrationNumber: string; make: string; model: string };
  service: { name: string };
  jobCard: { id: number; mechanic: { name: string } } | null;
  reception: { id: number; complaint: string; inspection: { id: number } } | null;
};

type Diagnostic = {
  id: number;
  complaint: string;
  procedure: string | null;
  faultCodes: string | null;
  symptoms: string | null;
  diagnosis: string | null;
  recommendedRepair: string | null;
  diagnosticMinutes: number;
  technicianName: string;
  createdAt: string;
  appointment: {
    id: number;
    customer: { name: string };
    vehicle: { registrationNumber: string; make: string; model: string };
    service: { name: string };
  };
  jobCard: { id: number; mechanic: { name: string } } | null;
};

type DiagnosticsResponse = {
  diagnostics?: Diagnostic[];
  eligibleAppointments?: Appointment[];
  error?: string;
};

export function DiagnosticManager() {
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentId, setAppointmentId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadDiagnostics() {
    const response = await fetch("/api/diagnostics", { credentials: "same-origin", cache: "no-store" });
    const result: DiagnosticsResponse = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Diagnostic records could not be loaded.");
    setDiagnostics(result.diagnostics ?? []);
    setAppointments(result.eligibleAppointments ?? []);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/diagnostics", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result: DiagnosticsResponse = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Diagnostic records could not be loaded.");
        if (active) {
          setDiagnostics(result.diagnostics ?? []);
          setAppointments(result.eligibleAppointments ?? []);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Diagnostic records could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function saveDiagnostic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/diagnostics", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId,
          procedure: data.get("procedure"),
          faultCodes: data.get("faultCodes"),
          symptoms: data.get("symptoms"),
          diagnosis: data.get("diagnosis"),
          recommendedRepair: data.get("recommendedRepair"),
          diagnosticMinutes: Number(data.get("diagnosticMinutes")),
        }),
      });
      const result: { diagnostic?: { id: number }; error?: string } = await response.json();
      if (!response.ok || !result.diagnostic) throw new Error(result.error ?? "Diagnostic record could not be saved.");
      setSuccess(`Diagnostic record #${result.diagnostic.id} saved.`);
      form.reset();
      setAppointmentId(null);
      await loadDiagnostics();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Diagnostic record could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="rounded-xl bg-white p-5 text-sm text-slate-500">Loading diagnostics…</p>;

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}

      <form onSubmit={(event) => void saveDiagnostic(event)} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h2 className="text-xl font-black">Vehicle diagnostics</h2>
          <p className="mt-1 text-sm text-slate-500">Add any diagnostic notes that are available. The notes are optional.</p>
        </div>
        <label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2">
          Inspected vehicle
          <select required value={appointmentId ?? ""} onChange={(event) => {
            const selectedId = Number(event.target.value) || null;
            setAppointmentId(selectedId);
          }} className="rounded-xl border border-slate-200 px-3 py-2">
            <option value="">Select a checked-in inspected vehicle</option>
            {appointments.map((appointment) => (
              <option key={appointment.id} value={appointment.id}>
                #{appointment.id} · {appointment.customer.name} · {appointment.vehicle.registrationNumber} · {appointment.service.name}
              </option>
            ))}
          </select>
        </label>
        {appointmentId && (
          <p className="text-sm text-slate-600 sm:col-span-2">
            Customer complaint: {appointments.find((appointment) => appointment.id === appointmentId)?.reception?.complaint ?? "No complaint recorded"}
          </p>
        )}
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Diagnostic time (minutes)
          <input name="diagnosticMinutes" required type="number" min="1" max="1440" defaultValue="30" className="rounded-xl border border-slate-200 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Diagnostic procedure (optional)
          <textarea name="procedure" maxLength={5000} className="min-h-20 rounded-xl border border-slate-200 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Fault codes (optional)
          <textarea name="faultCodes" maxLength={5000} className="min-h-20 rounded-xl border border-slate-200 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Symptoms (optional)
          <textarea name="symptoms" maxLength={5000} className="min-h-20 rounded-xl border border-slate-200 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Diagnosis (optional)
          <textarea name="diagnosis" maxLength={5000} className="min-h-20 rounded-xl border border-slate-200 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2">
          Recommended repair (optional)
          <textarea name="recommendedRepair" maxLength={5000} className="min-h-20 rounded-xl border border-slate-200 px-3 py-2" />
        </label>
        <button disabled={busy || !appointmentId} className="w-fit rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Saving diagnostics…" : "Save diagnostic record"}
        </button>
      </form>

      <section className="space-y-3">
        <h2 className="text-xl font-black">Diagnostic history</h2>
        {diagnostics.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">No diagnostic records yet.</p>}
        {diagnostics.map((record) => (
          <article key={record.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-bold">Appointment #{record.appointment.id} · {record.appointment.vehicle.registrationNumber}</h3>
                <p className="text-sm text-slate-600">{record.appointment.customer.name} · {record.appointment.service.name} · Technician: {record.technicianName}</p>
                <p className="text-sm text-slate-500">{new Date(record.createdAt).toLocaleString()} · {record.diagnosticMinutes} minutes</p>
              </div>
              {record.jobCard && <p className="text-sm text-emerald-700">Job JC-{record.jobCard.id} · {record.jobCard.mechanic.name}</p>}
            </div>
            <dl className="mt-3 grid gap-2 border-t border-slate-100 pt-3 text-sm sm:grid-cols-2">
              <div><dt className="font-semibold">Complaint</dt><dd>{record.complaint}</dd></div>
              <div><dt className="font-semibold">Procedure</dt><dd>{record.procedure || "—"}</dd></div>
              <div><dt className="font-semibold">Fault codes</dt><dd>{record.faultCodes || "—"}</dd></div>
              <div><dt className="font-semibold">Symptoms</dt><dd>{record.symptoms || "—"}</dd></div>
              <div><dt className="font-semibold">Diagnosis</dt><dd>{record.diagnosis || "—"}</dd></div>
              <div><dt className="font-semibold">Recommended repair</dt><dd>{record.recommendedRepair || "—"}</dd></div>
            </dl>
          </article>
        ))}
      </section>
    </div>
  );
}
