"use client";

import { useEffect, useState, type FormEvent } from "react";

const staffRoles = [
  "ADMIN",
  "SUPER_ADMIN",
  "GARAGE_MANAGER",
  "SERVICE_ADVISOR",
  "MECHANIC",
  "STOREKEEPER",
  "ACCOUNTANT",
] as const;

type StaffRole = (typeof staffRoles)[number];

type ManagedUser = {
  id: number;
  name: string;
  username: string | null;
  email: string;
  role: StaffRole | "CUSTOMER";
  mechanic: { specialization: string | null; status: string } | null;
};

type AdminUserManagerProps = {
  currentUserId: number;
};

export function AdminUserManager({ currentUserId }: AdminUserManagerProps) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [role, setRole] = useState<StaffRole>("MECHANIC");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadUsers() {
    setError("");
    try {
      const response = await fetch("/api/users", { credentials: "same-origin", cache: "no-store" });
      const result: { users?: ManagedUser[]; error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "User list could not be loaded.");
      setUsers(result.users ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "User list could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    fetch("/api/users", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result: { users?: ManagedUser[]; error?: string } = await response.json();
        if (!response.ok) throw new Error(result.error ?? "User list could not be loaded.");
        if (!cancelled) setUsers(result.users ?? []);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "User list could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          role,
          ...(role === "MECHANIC" ? {} : { phone: undefined, specialization: undefined }),
        }),
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Account could not be created.");
        return;
      }

      form.reset();
      setSuccess(`${role.replaceAll("_", " ").toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase())} account created.`);
      await loadUsers();
    } catch {
      setError("Could not reach the server. Please try again.");
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={createUser} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft md:grid-cols-2">
        <h2 className="text-xl font-black md:col-span-2">Create a staff account</h2>
        <input name="name" required minLength={2} maxLength={255} placeholder="Full name" className="rounded-xl border border-slate-200 px-3 py-2" />
        <input name="username" required minLength={3} maxLength={50} pattern="[A-Za-z0-9._-]+" placeholder="Username" className="rounded-xl border border-slate-200 px-3 py-2" />
        <input name="email" required type="email" maxLength={255} placeholder="Email" className="rounded-xl border border-slate-200 px-3 py-2" />
        <input name="password" required type="password" minLength={6} maxLength={128} placeholder="Temporary password (6+ characters)" className="rounded-xl border border-slate-200 px-3 py-2" />
        <select value={role} onChange={(event) => setRole(event.target.value as StaffRole)} className="rounded-xl border border-slate-200 px-3 py-2">
          {staffRoles.map((staffRole) => (
            <option key={staffRole} value={staffRole}>
              {staffRole.replaceAll("_", " ").toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase())}
            </option>
          ))}
        </select>
        {role === "MECHANIC" && (
          <>
            <input name="phone" required minLength={5} maxLength={50} placeholder="Phone number" className="rounded-xl border border-slate-200 px-3 py-2" />
            <input name="specialization" required minLength={2} maxLength={255} placeholder="Specialization" className="rounded-xl border border-slate-200 px-3 py-2" />
          </>
        )}
        <button className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white md:col-span-2">
          Create {role.replaceAll("_", " ").toLowerCase()}
        </button>
        {error && <p role="alert" className="text-sm text-red-700 md:col-span-2">{error}</p>}
        {success && <p role="status" className="text-sm text-emerald-700 md:col-span-2">{success}</p>}
      </form>

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Username</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-5 text-slate-500" colSpan={5}>Loading accounts…</td></tr>
            ) : users.map((managedUser) => (
              <tr key={managedUser.id} className="border-t border-slate-200">
                <td className="px-5 py-3 font-medium">
                  {managedUser.name}{managedUser.id === currentUserId ? " (you)" : ""}
                </td>
                <td className="px-5 py-3">{managedUser.username ?? "—"}</td>
                <td className="px-5 py-3">{managedUser.email}</td>
                <td className="px-5 py-3">{managedUser.role}</td>
                <td className="px-5 py-3">{managedUser.mechanic?.specialization ?? "—"}</td>
              </tr>
            ))}
            {!loading && users.length === 0 && (
              <tr><td className="px-5 py-5 text-slate-500" colSpan={5}>No accounts found.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
