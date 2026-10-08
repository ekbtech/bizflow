import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { DiagnosticManager } from "@/components/diagnostic-manager";
import { InspectionManager } from "@/components/inspection-manager";
import { getSessionUser } from "@/lib/auth";
import { getRoleHomePath, hasPermission } from "@/lib/permissions";

export default async function InspectionsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "inspections:read") || !hasPermission(user.role, "diagnostics:read")) {
    redirect(getRoleHomePath(user.role));
  }

  return (
    <DashboardShell
      title="Inspections & Diagnostics"
      subtitle="Record structured vehicle inspections and diagnostic findings"
      active="Inspections & Diagnostics"
    >
      <div className="space-y-10">
        <InspectionManager />
        <DiagnosticManager />
      </div>
    </DashboardShell>
  );
}
