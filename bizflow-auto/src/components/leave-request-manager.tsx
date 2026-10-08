"use client";

import { useEffect, useState, type FormEvent } from "react";

type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
type LeaveType = "ANNUAL" | "SICK" | "COMPASSIONATE" | "MATERNITY" | "PATERNITY" | "UNPAID" | "STUDY" | "OTHER";
type LeaveRequest = {
  id: number;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
  responseNote: string | null;
  reviewedAt: string | null;
  user: { id: number; name: string; role: string };
  reviewedBy: { name: string } | null;
  createdAt: string;
};

type ApiResult = { requests?: LeaveRequest[]; request?: LeaveRequest; error?: string };

function formatDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString();
}

function statusStyle(status: LeaveStatus) {
  if (status === "APPROVED") return "bg-emerald-100 text-emerald-800";
  if (status === "REJECTED" || status === "CANCELLED") return "bg-slate-100 text-slate-700";
  return "bg-amber-100 text-amber-800";
}

const leaveTypes: { value: LeaveType; label: string }[] = [
  { value: "ANNUAL", label: "Annual leave" },
  { value: "SICK", label: "Sick leave" },
  { value: "COMPASSIONATE", label: "Compassionate leave" },
  { value: "MATERNITY", label: "Maternity leave" },
  { value: "PATERNITY", label: "Paternity leave" },
  { value: "UNPAID", label: "Unpaid leave" },
  { value: "STUDY", label: "Study leave" },
  { value: "OTHER", label: "Other" },
];

function leaveTypeLabel(type: LeaveType) {
  return leaveTypes.find((option) => option.value === type)?.label ?? type;
}

export function LeaveRequestManager({ canManage, currentUserId, currentUserName, todayDate }: { canManage: boolean; currentUserId: number; currentUserName: string; todayDate: string }) {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadRequests() {
    const response = await fetch("/api/leave-requests", { credentials: "same-origin", cache: "no-store" });
    const result: ApiResult = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Leave requests could not be loaded.");
    setRequests(result.requests ?? []);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/leave-requests", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result: ApiResult = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Leave requests could not be loaded.");
        if (active) setRequests(result.requests ?? []);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Leave requests could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/leave-requests", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result: ApiResult = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Leave request could not be submitted.");
      form.reset();
      setSuccess("Leave request submitted.");
      await loadRequests();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Leave request could not be submitted.");
    }
  }

  async function updateRequest(id: number, action: "APPROVE" | "REJECT" | "CANCEL", responseNote?: string) {
    setBusyId(id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/leave-requests/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, responseNote }),
      });
      const result: ApiResult = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Leave request could not be updated.");
      setSuccess(action === "CANCEL" ? "Leave request cancelled." : `Leave request ${action === "APPROVE" ? "approved" : "rejected"}.`);
      await loadRequests();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Leave request could not be updated.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={(event) => void submitRequest(event)} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft sm:grid-cols-2">
        <h2 className="text-lg font-bold sm:col-span-2">Leave application</h2>
        <p className="text-sm text-slate-600 sm:col-span-2">Applicant: <strong>{currentUserName}</strong></p>
        <label className="grid gap-1 text-sm font-medium sm:col-span-2">
          Leave type
          <select name="leaveType" required defaultValue="ANNUAL" className="rounded-xl border border-slate-200 px-3 py-2">
            {leaveTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Start date
          <input name="startDate" type="date" required min={todayDate} className="rounded-xl border border-slate-200 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          End date
          <input name="endDate" type="date" required min={todayDate} className="rounded-xl border border-slate-200 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm font-medium sm:col-span-2">
          Reason
          <textarea name="reason" required minLength={5} maxLength={2000} className="min-h-20 rounded-xl border border-slate-200 px-3 py-2" />
        </label>
        <button className="w-fit rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white">Submit request</button>
      </form>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}

      <section className="space-y-3">
        <h2 className="text-xl font-black">{canManage ? "Staff leave requests" : "My leave requests"}</h2>
        {loading && <p className="rounded-xl bg-white p-5 text-sm text-slate-500">Loading requests…</p>}
        {!loading && requests.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">No leave requests yet.</p>}
        {requests.map((leaveRequest) => (
          <article key={leaveRequest.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-bold">{leaveRequest.user.name}{canManage ? ` · ${leaveRequest.user.role.replaceAll("_", " ")}` : ""}</h3>
                <p className="text-sm font-medium text-orange-700">{leaveTypeLabel(leaveRequest.leaveType)}</p>
                <p className="text-sm text-slate-600">{formatDate(leaveRequest.startDate)} – {formatDate(leaveRequest.endDate)}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyle(leaveRequest.status)}`}>{leaveRequest.status}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm">{leaveRequest.reason}</p>
            {leaveRequest.responseNote && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Response: {leaveRequest.responseNote}</p>}
            {leaveRequest.reviewedBy && <p className="text-xs text-slate-500">Reviewed by {leaveRequest.reviewedBy.name}</p>}
            {leaveRequest.status === "PENDING" && (
              <div className="flex flex-wrap gap-2">
                {canManage && leaveRequest.user.id !== currentUserId && (
                  <>
                    <button type="button" disabled={busyId === leaveRequest.id} onClick={() => void updateRequest(leaveRequest.id, "APPROVE")} className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Approve</button>
                    <button type="button" disabled={busyId === leaveRequest.id} onClick={() => {
                      const responseNote = window.prompt("Reason for rejection (optional):") ?? "";
                      void updateRequest(leaveRequest.id, "REJECT", responseNote);
                    }} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Reject</button>
                  </>
                )}
                {leaveRequest.user.id === currentUserId && (
                  <button type="button" disabled={busyId === leaveRequest.id} onClick={() => void updateRequest(leaveRequest.id, "CANCEL")} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Cancel request</button>
                )}
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
