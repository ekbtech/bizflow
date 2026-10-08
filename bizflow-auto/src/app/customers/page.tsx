import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { CustomerManager } from "@/components/customer-manager";
import { getSessionUser } from "@/lib/auth";
import { getRoleHomePath, hasPermission } from "@/lib/permissions";

export default async function CustomersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "customers:read")) redirect(getRoleHomePath(user.role));

  return (
    <DashboardShell
      title="Customer Management"
      subtitle="Create and maintain customer records and vehicle ownership"
      active="Customers"
    >
      <CustomerManager
        canWrite={hasPermission(user.role, "customers:write")}
        canDelete={hasPermission(user.role, "customers:delete")}
      />
    </DashboardShell>
  );
}
