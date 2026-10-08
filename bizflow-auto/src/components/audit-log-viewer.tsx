"use client";

import { useEffect, useState } from "react";

type AuditLog = {
  id: number;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  details: unknown;
  createdAt: string;
  actor: { id: number; name: string; email: string } | null;
};

export function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/audit-logs?limit=100", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result: { auditLogs?: AuditLog[]; error?: string } = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Audit logs could not be loaded.");
        if (!cancelled) setLogs(result.auditLogs ?? []);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Audit logs could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="rounded-xl bg-white p-5 text-sm text-slate-500">Loading audit records…</p>;
  if (error) return <p role="alert" className="rounded-xl border border-red-200 bg-white p-5 text-sm text-red-700">{error}</p>;
  if (logs.length === 0) return <p className="rounded-xl bg-white p-5 text-sm text-slate-500">No audit records have been recorded yet.</p>;

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-5 py-3">Date</th>
            <th className="px-5 py-3">User</th>
            <th className="px-5 py-3">Action</th>
            <th className="px-5 py-3">Record</th>
            <th className="px-5 py-3">IP address</th>
            <th className="px-5 py-3">Details</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-t border-slate-200 align-top">
              <td className="whitespace-nowrap px-5 py-3">{new Date(log.createdAt).toLocaleString()}</td>
              <td className="px-5 py-3">{log.actor ? `${log.actor.name} (${log.actor.email})` : "System"}</td>
              <td className="whitespace-nowrap px-5 py-3 font-medium">{log.action}</td>
              <td className="px-5 py-3">{log.entityType}{log.entityId ? ` #${log.entityId}` : ""}</td>
              <td className="px-5 py-3">{log.ipAddress ?? "—"}</td>
              <td className="max-w-xs break-words px-5 py-3 text-xs text-slate-600">
                {log.details ? JSON.stringify(log.details) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
