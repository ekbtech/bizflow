import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { ProcurementManager } from "@/components/procurement-manager";
import { getSessionUser } from "@/lib/auth";
import { getRoleHomePath, hasPermission } from "@/lib/permissions";

export default async function ProcurementPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "spareParts:write")) redirect(getRoleHomePath(user.role));

  return (
    <DashboardShell title="Procurement" subtitle="Manage suppliers, purchasing, and stock receipts" active="Procurement">
      <ProcurementManager />
    </DashboardShell>
  );
}
