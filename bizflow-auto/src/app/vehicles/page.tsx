import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { VehicleManager } from "@/components/vehicle-manager";
import { getSessionUser } from "@/lib/auth";
import { getBusinessDateInputValue } from "@/lib/date-input";
import { getRoleHomePath, hasPermission } from "@/lib/permissions";

export default async function VehiclesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "vehicles:read")) redirect(getRoleHomePath(user.role));
  const maxVehicleYear = Number(getBusinessDateInputValue().slice(0, 4)) + 1;

  return (
    <DashboardShell
      title="Vehicle Management"
      subtitle="Maintain vehicle data, ownership records and service history"
      active="Vehicles"
    >
      <VehicleManager
        canWrite={hasPermission(user.role, "vehicles:write")}
        canDelete={hasPermission(user.role, "vehicles:delete")}
        maxVehicleYear={maxVehicleYear}
      />
    </DashboardShell>
  );
}
