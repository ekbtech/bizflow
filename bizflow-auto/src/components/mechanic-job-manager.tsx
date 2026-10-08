"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ModuleIcon } from "@/components/module-icon";

type Job = {
  id: number;
  status: "WAITING" | "INSPECTION" | "DIAGNOSIS" | "AWAITING_APPROVAL" | "IN_PROGRESS" | "QUALITY_CHECK" | "COMPLETED" | "DELIVERED" | "CANCELLED";
  diagnosis: string | null;
  workDone: string | null;
  quotation: {
    status: string;
    totalAmount: string | number;
    items: { partId: number | null; description: string; quantity: string | number; unitPrice: string | number }[];
  } | null;
  appointment: {
    customer: { name: string; phone: string | null };
    vehicle: { registrationNumber: string; make: string; model: string; year: number; mileage: number };
    service: { name: string };
  };
  parts: { quantity: number; part: { name: string; partNumber: string | null } }[];
};

type SparePart = {
  id: number;
  name: string;
  partNumber: string | null;
  quantity: number;
};

export function MechanicJobManager() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [parts, setParts] = useState<SparePart[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyJob, setBusyJob] = useState<number | null>(null);

  async function loadData() {
    setError("");
    try {
      const [jobsResponse, partsResponse] = await Promise.all([
        fetch("/api/mechanic/jobs", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/spare-parts", { credentials: "same-origin", cache: "no-store" }),
      ]);
      const [jobResult, partResult]: [
        { jobs?: Job[]; error?: string },
        { parts?: SparePart[]; error?: string },
      ] = await Promise.all([jobsResponse.json(), partsResponse.json()]);

      if (!jobsResponse.ok) throw new Error(jobResult.error ?? "Assigned jobs could not be loaded.");
      if (!partsResponse.ok) throw new Error(partResult.error ?? "Spare parts could not be loaded.");
      setJobs(jobResult.jobs ?? []);
      setParts(partResult.parts ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Mechanic data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/mechanic/jobs", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/spare-parts", { credentials: "same-origin", cache: "no-store" }),
    ])
      .then(async ([jobsResponse, partsResponse]) => {
        const [jobResult, partResult]: [
          { jobs?: Job[]; error?: string },
          { parts?: SparePart[]; error?: string },
        ] = await Promise.all([jobsResponse.json(), partsResponse.json()]);
        if (!jobsResponse.ok) throw new Error(jobResult.error ?? "Assigned jobs could not be loaded.");
        if (!partsResponse.ok) throw new Error(partResult.error ?? "Spare parts could not be loaded.");
        if (!cancelled) {
          setJobs(jobResult.jobs ?? []);
          setParts(partResult.parts ?? []);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Mechanic data could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function updateJob(event: FormEvent<HTMLFormElement>, jobId: number) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusyJob(jobId);
    setError("");
    setSuccess("");
    const formData = new FormData(form);
    const partId = Number(formData.get("partId"));
    const quantity = Number(formData.get("quantity"));
    const body = {
      diagnosis: formData.get("diagnosis"),
      ...(formData.has("workDone") ? { workDone: formData.get("workDone") } : {}),
      ...(formData.has("status") ? { status: formData.get("status") } : {}),
      ...(partId > 0 && quantity > 0 ? { partsUsed: [{ partId, quantity }] } : {}),
    };

    try {
      const response = await fetch(`/api/mechanic/jobs/${jobId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result: { error?: string; emailNotification?: { sent: boolean; reason: string } } = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Job card could not be updated.");
        return;
      }
      setSuccess(result.emailNotification && !result.emailNotification.sent
        ? `Job card JC-${jobId} updated. Customer email notification was not sent (${result.emailNotification.reason.replaceAll("_", " ")}).`
        : `Job card JC-${jobId} updated.`);
      await loadData();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusyJob(null);
    }
  }

  if (loading) return <p className="rounded-xl bg-white p-5 text-sm text-slate-500">Loading assigned jobs…</p>;

  return (
    <div id="jobs" className="space-y-4">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
      {jobs.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-soft">
          You don&apos;t have any assigned jobs yet.
        </p>
      )}
      {jobs.map((job) => {
        const canUpdate = !["QUALITY_CHECK", "COMPLETED", "DELIVERED", "CANCELLED"].includes(job.status);
        return (
        <form
          key={job.id}
          onSubmit={(event) => updateJob(event, job.id)}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft"
        >
          <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-orange-600"><ModuleIcon name="job" />JC-{job.id}</p>
              <h2 className="mt-1 text-xl font-black">{job.appointment.service.name}</h2>
              <p className="text-sm text-slate-600">
                {job.appointment.vehicle.make} {job.appointment.vehicle.model} ({job.appointment.vehicle.year}) · {job.appointment.vehicle.registrationNumber}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Customer: {job.appointment.customer.name}
                {job.appointment.customer.phone ? ` · ${job.appointment.customer.phone}` : ""}
              </p>
            </div>
            <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {job.status.replace("_", " ")}
            </span>
          </header>

          <section className={`rounded-xl p-3 text-sm ${job.quotation?.status === "APPROVED" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
            {job.quotation?.status === "APPROVED"
              ? `Customer-approved quotation: KSh ${Number(job.quotation.totalAmount).toLocaleString()}. Work and parts must stay within the approved scope.`
              : job.quotation?.status === "SENT"
                ? "Quotation sent. Repair work and parts use remain locked until the customer approves it."
                : job.quotation?.status === "DRAFT"
                  ? "Quotation draft not sent yet. Repair work and parts use remain locked until the customer approves it."
                  : job.quotation?.status === "REJECTED"
                    ? "The customer rejected the quotation. Ask the service advisor to revise it before starting repair work."
                    : job.quotation?.status === "EXPIRED"
                      ? "The quotation expired. Ask the service advisor to issue a new one before starting repair work."
                      : "No quotation has been created. Diagnosis may be recorded; complete inspection and diagnostics, then ask the service advisor to prepare and send a quotation."}
          </section>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              Diagnosis
              <textarea name="diagnosis" defaultValue={job.diagnosis ?? ""} maxLength={5000} disabled={!canUpdate} className="mt-1 min-h-24 w-full rounded-xl border border-slate-200 p-3 font-normal" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Work performed
              <textarea name="workDone" defaultValue={job.workDone ?? ""} maxLength={5000} disabled={!canUpdate || job.quotation?.status !== "APPROVED"} className="mt-1 min-h-24 w-full rounded-xl border border-slate-200 p-3 font-normal" />
            </label>
          </div>

          {job.parts.length > 0 && (
            <p className="text-sm text-slate-600">
              Parts used: {job.parts.map(({ part, quantity }) => `${quantity} × ${part.name}`).join(", ")}
            </p>
          )}

          {canUpdate && (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="text-sm font-semibold text-slate-700 md:col-span-2">
                  Record a spare part used
                  <select name="partId" defaultValue="" disabled={job.quotation?.status !== "APPROVED"} className="mt-1 w-full rounded-xl border border-slate-200 p-2 font-normal disabled:bg-slate-100">
                    <option value="">No part for this update</option>
                    {parts.filter((part) => part.quantity > 0 && job.quotation?.items.some((item) => item.partId === part.id)).map((part) => (
                      <option key={part.id} value={part.id}>
                        {part.name}{part.partNumber ? ` (${part.partNumber})` : ""} · {part.quantity} in stock · approved {job.quotation?.items.find((item) => item.partId === part.id)?.quantity}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Quantity
                  <input name="quantity" type="number" min="1" max="1000" defaultValue="1" className="mt-1 w-full rounded-xl border border-slate-200 p-2 font-normal" />
                </label>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="text-sm font-semibold text-slate-700">
                  Job status
                  <select name="status" defaultValue="IN_PROGRESS" disabled={job.quotation?.status !== "APPROVED"} className="mt-1 block rounded-xl border border-slate-200 p-2 font-normal disabled:bg-slate-100">
                    <option value="IN_PROGRESS">In progress</option>
                    <option value="QUALITY_CHECK">Ready for quality check</option>
                  </select>
                </label>
                <button disabled={busyJob === job.id} className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {busyJob === job.id ? "Saving…" : <span className="inline-flex items-center gap-2"><ModuleIcon name="job" />Save</span>}
                </button>
              </div>
            </>
          )}
        </form>
        );
      })}
    </div>
  );
}
