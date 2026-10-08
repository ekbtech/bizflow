"use client";

import { useEffect, useState } from "react";

type Mechanic = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  specialization: string | null;
  status: string;
  _count: { jobCards: number };
};

export function MechanicManager({ canManage }: { canManage: boolean }) {
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/mechanics", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result: { mechanics?: Mechanic[]; error?: string } = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Mechanics could not be loaded.");
        if (active) setMechanics(result.mechanics ?? []);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Mechanics could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function updateMechanic(id: number, values: { status?: string; specialization?: string | null }) {
    setError("");
    setSuccess("");
    setBusyId(id);
    try {
      const response = await fetch(`/api/mechanics/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result: { mechanic?: Mechanic; error?: string } = await response.json();
      if (!response.ok || !result.mechanic) throw new Error(result.error ?? "Mechanic could not be updated.");
      setMechanics((current) => current.map((mechanic) => mechanic.id === id ? { ...mechanic, ...result.mechanic } : mechanic));
      setSuccess("Mechanic profile updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Mechanic could not be updated.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr><th className="px-4 py-3">Mechanic</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Specialization</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Jobs</th></tr>
          </thead>
          <tbody>
            {mechanics.map((mechanic) => (
              <tr key={mechanic.id} className="border-t border-slate-200">
                <td className="px-4 py-3 font-semibold">{mechanic.name}</td>
                <td className="px-4 py-3">{mechanic.phone ?? "—"}</td>
                <td className="px-4 py-3">{mechanic.email ?? "—"}</td>
                <td className="px-4 py-3">
                  {canManage ? (
                    <form onSubmit={(event) => { event.preventDefault(); void updateMechanic(mechanic.id, { specialization: new FormData(event.currentTarget).get("specialization")?.toString() ?? "" }); }}>
                      <input name="specialization" key={`${mechanic.id}-${mechanic.specialization}`} defaultValue={mechanic.specialization ?? ""} maxLength={255} aria-label={`${mechanic.name} specialization`} className="w-36 rounded-lg border border-slate-200 px-2 py-1" onBlur={(event) => {
                        if (event.currentTarget.value !== (mechanic.specialization ?? "")) void updateMechanic(mechanic.id, { specialization: event.currentTarget.value.trim() || null });
                      }} />
                    </form>
                  ) : mechanic.specialization ?? "—"}
                </td>
                <td className="px-4 py-3">
                  {canManage ? (
                    <select value={mechanic.status} disabled={busyId === mechanic.id} onChange={(event) => void updateMechanic(mechanic.id, { status: event.target.value })} aria-label={`${mechanic.name} status`} className="rounded-lg border border-slate-200 px-2 py-1">
                      {["Available", "Busy", "On leave"].map((status) => <option key={status}>{status}</option>)}
                    </select>
                  ) : mechanic.status}
                </td>
                <td className="px-4 py-3">{mechanic._count.jobCards}</td>
              </tr>
            ))}
            {mechanics.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No mechanic accounts yet. Create a mechanic account to add a profile.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
