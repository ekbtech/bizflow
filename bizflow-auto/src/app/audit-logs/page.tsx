import { redirect } from "next/navigation";
import { AuditLogViewer } from "@/components/audit-log-viewer";
import { DashboardShell } from "@/components/dashboard-shell";
import { getSessionUser } from "@/lib/auth";
import { getRoleHomePath, hasPermission } from "@/lib/permissions";

export default async function AuditLogsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "audit:read")) redirect(getRoleHomePath(user.role));

  return (
    <DashboardShell title="Audit logs" subtitle="Review recorded staff and system actions" active="Audit logs">
      <AuditLogViewer />
    </DashboardShell>
  );
}
