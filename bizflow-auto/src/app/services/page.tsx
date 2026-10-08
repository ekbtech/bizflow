import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { ServiceManager } from "@/components/service-manager";
import { getSessionUser } from "@/lib/auth";
import { getRoleHomePath, hasPermission } from "@/lib/permissions";

export default async function ServicesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "services:read")) redirect(getRoleHomePath(user.role));

  const canWrite = hasPermission(user.role, "services:write");

  return (
    <DashboardShell
      title="Service Catalog"
      subtitle="Define the services your garage offers and their pricing"
      active="Services"
      actions={canWrite ? (
        <button className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-soft">
          + Add Service
        </button>
      ) : undefined}
    >
      <ServiceManager
        canWrite={canWrite}
        canDelete={hasPermission(user.role, "services:delete")}
      />
    </DashboardShell>
  );
}
