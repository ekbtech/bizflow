import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { MechanicJobManager } from "@/components/mechanic-job-manager";
import { getSessionUser } from "@/lib/auth";
import { getRoleHomePath } from "@/lib/permissions";

export default async function MechanicDashboardPage() {
  const user = await getSessionUser();

  if (!user) redirect("/login");
  if (user.role !== "MECHANIC") redirect(getRoleHomePath(user.role));

  return (
    <DashboardShell
      title="Jobs"
      subtitle={user.name}
      active="Jobs"
      actions={<span className="text-sm font-semibold text-slate-600">{user.name}</span>}
    >
        <MechanicJobManager />
    </DashboardShell>
  );
}
