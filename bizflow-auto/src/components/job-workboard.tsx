"use client";

import { useEffect, useMemo, useState } from "react";

type JobStatus = "WAITING" | "INSPECTION" | "DIAGNOSIS" | "AWAITING_APPROVAL" | "IN_PROGRESS" | "QUALITY_CHECK" | "COMPLETED" | "DELIVERED" | "CANCELLED";
type Job = {
  id: number;
  status: JobStatus;
  diagnosis: string | null;
  workDone: string | null;
  notes: string | null;
  startedAt: string | null;
  workCompletedAt: string | null;
  completedAt: string | null;
  qualityCheckedAt: string | null;
  qualityNotes: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  mechanic: { id: number; name: string };
  qualityCheckedBy: { name: string } | null;
  appointment: {
    id: number;
    appointmentDate: string;
    appointmentTime: string;
    priority: string;
    description: string | null;
    status: string;
    customer: { name: string; phone: string; email: string | null };
    vehicle: { registrationNumber: string; make: string; model: string; year: number };
    service: { name: string };
    reception: { mileage: number; complaint: string } | null;
  };
  quotation: {
    id: number;
    status: string;
    totalAmount: string | number;
    items: { id: number; itemType: string; description: string; quantity: string | number; unitPrice: string | number; lineTotal: string | number }[];
  } | null;
  parts: { quantity: number; part: { name: string; partNumber: string | null } }[];
  invoice: { id: number; status: string; totalAmount: string | number } | null;
};
type BoardResponse = { jobs?: Job[]; error?: string };
type UpdateResponse = { job?: { id: number }; emailNotification?: { sent: boolean; reason: string }; error?: string };
const statuses: JobStatus[] = ["WAITING", "INSPECTION", "DIAGNOSIS", "AWAITING_APPROVAL", "IN_PROGRESS", "QUALITY_CHECK", "COMPLETED", "DELIVERED", "CANCELLED"];

function money(value: string | number) {
  return `KSh ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function label(status: JobStatus) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusColor(status: JobStatus) {
  if (status === "COMPLETED" || status === "DELIVERED") return "bg-emerald-100 text-emerald-800";
  if (status === "IN_PROGRESS" || status === "QUALITY_CHECK") return "bg-amber-100 text-amber-900";
  if (status === "CANCELLED") return "bg-slate-200 text-slate-700";
  return "bg-blue-100 text-blue-800";
}

export function JobWorkboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [qualityNotes, setQualityNotes] = useState<Record<number, string>>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadJobs() {
    const response = await fetch("/api/job-cards", { credentials: "same-origin", cache: "no-store" });
    const result: BoardResponse = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Job cards could not be loaded.");
    const loadedJobs = result.jobs ?? [];
    setJobs(loadedJobs);
    setNotes(Object.fromEntries(loadedJobs.map((job) => [job.id, job.notes ?? ""])));
    setQualityNotes(Object.fromEntries(loadedJobs.map((job) => [job.id, job.qualityNotes ?? ""])));
  }

  useEffect(() => {
    let active = true;
    fetch("/api/job-cards", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result: BoardResponse = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Job cards could not be loaded.");
        if (active) {
          const loadedJobs = result.jobs ?? [];
          setJobs(loadedJobs);
          setNotes(Object.fromEntries(loadedJobs.map((job) => [job.id, job.notes ?? ""])));
          setQualityNotes(Object.fromEntries(loadedJobs.map((job) => [job.id, job.qualityNotes ?? ""])));
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Job cards could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function updateJob(jobId: number, body: Record<string, unknown>, message: string) {
    setBusyId(jobId);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/job-cards/${jobId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result: UpdateResponse = await response.json();
      if (!response.ok || !result.job) throw new Error(result.error ?? "Job-card update failed.");
      setSuccess(message);
      if (result.emailNotification && !result.emailNotification.sent) {
        setSuccess(`${message} Customer notification could not be delivered (${result.emailNotification.reason.replaceAll("_", " ")}).`);
      }
      await loadJobs();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Job-card update failed.");
    } finally {
      setBusyId(null);
    }
  }

  const normalizedQuery = query.trim().toLowerCase();
  const visibleJobs = useMemo(() => jobs.filter((job) => !normalizedQuery || [
    `JC-${job.id}`,
    job.appointment.customer.name,
    job.appointment.vehicle.registrationNumber,
    job.appointment.vehicle.make,
    job.appointment.vehicle.model,
    job.appointment.service.name,
    job.mechanic.name,
    job.status,
  ].some((value) => value.toLowerCase().includes(normalizedQuery))), [jobs, normalizedQuery]);

  if (loading) return <p className="rounded-xl bg-white p-5 text-sm text-slate-500">Loading workshop board…</p>;

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">Track the full job lifecycle from inspection to paid delivery.</p>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search job, customer, vehicle, mechanic" aria-label="Search workshop jobs" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm sm:max-w-sm" />
      </div>
      <div className="overflow-x-auto pb-3">
        <div className="grid min-w-[2430px] grid-cols-9 gap-3">
          {statuses.map((status) => {
            const statusJobs = visibleJobs.filter((job) => job.status === status);
            return (
              <section key={status} aria-label={`${label(status)} jobs`} className="min-h-80 rounded-2xl bg-slate-200/70 p-2">
                <header className="mb-2 flex items-center justify-between gap-2 px-1 py-2">
                  <h2 className="text-sm font-bold">{label(status)}</h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold">{statusJobs.length}</span>
                </header>
                <div className="space-y-2">
                  {statusJobs.map((job) => (
                    <article key={job.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <header className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-orange-600">JC-{job.id} · {job.appointment.priority}</p>
                          <h3 className="mt-1 text-sm font-bold">{job.appointment.vehicle.registrationNumber}</h3>
                          <p className="text-xs text-slate-600">{job.appointment.vehicle.make} {job.appointment.vehicle.model}</p>
                        </div>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusColor(job.status)}`}>{label(job.status)}</span>
                      </header>
                      <dl className="space-y-1 text-xs text-slate-600">
                        <div><dt className="inline font-semibold">Customer:</dt> <dd className="inline">{job.appointment.customer.name}</dd></div>
                        <div><dt className="inline font-semibold">Service:</dt> <dd className="inline">{job.appointment.service.name}</dd></div>
                        <div><dt className="inline font-semibold">Mechanic:</dt> <dd className="inline">{job.mechanic.name}</dd></div>
                        <div><dt className="inline font-semibold">Mileage:</dt> <dd className="inline">{job.appointment.reception?.mileage.toLocaleString() ?? "—"} km</dd></div>
                        <div><dt className="inline font-semibold">Appointment:</dt> <dd className="inline">{new Date(job.appointment.appointmentDate).toLocaleDateString()} {new Date(job.appointment.appointmentTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: "UTC" })}</dd></div>
                        {job.startedAt && <div><dt className="inline font-semibold">Started:</dt> <dd className="inline">{new Date(job.startedAt).toLocaleString()}</dd></div>}
                        {job.workCompletedAt && <div><dt className="inline font-semibold">Repair finished:</dt> <dd className="inline">{new Date(job.workCompletedAt).toLocaleString()}</dd></div>}
                        {job.completedAt && <div><dt className="inline font-semibold">Quality passed:</dt> <dd className="inline">{new Date(job.completedAt).toLocaleString()}</dd></div>}
                        {job.deliveredAt && <div><dt className="inline font-semibold">Delivered:</dt> <dd className="inline">{new Date(job.deliveredAt).toLocaleString()}</dd></div>}
                      </dl>
                      <div className="space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-600">
                        <p><strong>Complaint:</strong> {job.appointment.reception?.complaint ?? job.appointment.description ?? "—"}</p>
                        <p><strong>Diagnosis:</strong> {job.diagnosis || "Not recorded"}</p>
                        <p><strong>Work:</strong> {job.workDone || "Not recorded"}</p>
                        <p><strong>Parts:</strong> {job.parts.length ? job.parts.map(({ part, quantity }) => `${quantity} × ${part.name}`).join(", ") : "None recorded"}</p>
                      </div>
                      {job.quotation && (
                        <div className="rounded-lg bg-slate-50 p-2 text-xs">
                          <p className="font-semibold">Quotation QUO-{String(job.quotation.id).padStart(6, "0")} · {job.quotation.status}</p>
                          <p>{money(job.quotation.totalAmount)}</p>
                        </div>
                      )}
                      {job.invoice && <p className="text-xs font-semibold">Invoice INV-{job.invoice.id} · {money(job.invoice.totalAmount)} · {job.invoice.status}</p>}
                      {job.qualityCheckedBy && <p className="text-xs text-slate-500">Quality check by {job.qualityCheckedBy.name}{job.qualityNotes ? ` · ${job.qualityNotes}` : ""}</p>}
                      {job.cancelReason && <p className="text-xs text-slate-500">Cancelled: {job.cancelReason}</p>}

                      {!["DELIVERED", "CANCELLED"].includes(job.status) && (
                        <div className="space-y-2 border-t border-slate-100 pt-2">
                          <label className="block text-xs font-semibold text-slate-700">
                            Job notes
                            <textarea value={notes[job.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [job.id]: event.target.value }))} maxLength={5000} className="mt-1 min-h-14 w-full rounded-lg border border-slate-200 p-2 font-normal" />
                          </label>
                          <button type="button" disabled={busyId === job.id} onClick={() => void updateJob(job.id, { action: "SAVE_NOTES", notes: notes[job.id] ?? "" }, `Notes saved for JC-${job.id}.`)} className="w-full rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Save notes</button>
                        </div>
                      )}
                      {job.status === "QUALITY_CHECK" && (
                        <div className="space-y-2 border-t border-slate-100 pt-2">
                          <label className="block text-xs font-semibold text-slate-700">
                            Quality-check notes
                            <textarea value={qualityNotes[job.id] ?? ""} onChange={(event) => setQualityNotes((current) => ({ ...current, [job.id]: event.target.value }))} maxLength={5000} placeholder="Required if the check fails" className="mt-1 min-h-14 w-full rounded-lg border border-slate-200 p-2 font-normal" />
                          </label>
                          <button type="button" disabled={busyId === job.id} onClick={() => void updateJob(job.id, { action: "QUALITY_CHECK", passed: false, notes: qualityNotes[job.id] }, `JC-${job.id} returned to repair for rework.`)} className="w-full rounded-full border border-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-50">Fail · return for rework</button>
                          <button type="button" disabled={busyId === job.id} onClick={() => void updateJob(job.id, { action: "QUALITY_CHECK", passed: true, notes: qualityNotes[job.id] }, `JC-${job.id} passed quality check; invoice created.`)} className="w-full rounded-full bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Pass · create invoice</button>
                        </div>
                      )}
                      {job.status === "COMPLETED" && (
                        <button type="button" disabled={busyId === job.id || job.invoice?.status !== "PAID"} onClick={() => void updateJob(job.id, { action: "DELIVER" }, `JC-${job.id} marked delivered.`)} className="w-full rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
                          {job.invoice?.status === "PAID" ? "Record vehicle delivery" : "Delivery requires full payment"}
                        </button>
                      )}
                      {["WAITING", "INSPECTION", "DIAGNOSIS", "AWAITING_APPROVAL"].includes(job.status) && (
                        <button type="button" disabled={busyId === job.id} onClick={() => {
                          const reason = window.prompt("Why is this job being cancelled?");
                          if (reason?.trim()) void updateJob(job.id, { action: "CANCEL", reason }, `JC-${job.id} cancelled.`);
                        }} className="w-full rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50">Cancel job</button>
                      )}
                    </article>
                  ))}
                  {statusJobs.length === 0 && <p className="rounded-lg bg-white/60 p-3 text-xs text-slate-500">No jobs</p>}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
