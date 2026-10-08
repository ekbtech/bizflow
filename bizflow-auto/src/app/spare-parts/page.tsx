import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { getSessionUser } from "@/lib/auth";
import { getRoleHomePath, hasPermission } from "@/lib/permissions";
import { SparePartManager } from "@/components/spare-part-manager";
import { InventoryMovementManager } from "@/components/inventory-movement-manager";

export default async function SparePartsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "spareParts:read")) redirect(getRoleHomePath(user.role));

  return (
    <DashboardShell title="Spare parts" subtitle="Manage stock levels, movements, transaction history, and reorder alerts" active="Spare Parts">
      <div className="space-y-6">
        <SparePartManager
          canManage={hasPermission(user.role, "spareParts:write")}
          canDelete={hasPermission(user.role, "spareParts:delete")}
        />
        {hasPermission(user.role, "spareParts:write") && <InventoryMovementManager />}
      </div>
    </DashboardShell>
  );
}
