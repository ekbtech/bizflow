import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { MechanicManager } from "@/components/mechanic-manager";
import { getSessionUser } from "@/lib/auth";
import { getRoleHomePath, hasPermission } from "@/lib/permissions";

export default async function MechanicsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "mechanics:read")) redirect(getRoleHomePath(user.role));

  const canManage = hasPermission(user.role, "mechanics:write");

  return (
    <DashboardShell
      title="Mechanics"
      subtitle="Manage mechanic profiles, specialties and availability"
      active="Mechanics"
      actions={hasPermission(user.role, "users:manage") ? <Link href="/users" className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-soft">Create mechanic account</Link> : undefined}
    >
      <MechanicManager canManage={canManage} />
    </DashboardShell>
  );
}
