import { redirect } from "next/navigation";
import { AdminUserManager } from "@/components/admin-user-manager";
import { DashboardShell } from "@/components/dashboard-shell";
import { getSessionUser } from "@/lib/auth";
import { getRoleHomePath, hasPermission } from "@/lib/permissions";

export default async function UsersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "users:manage")) redirect(getRoleHomePath(user.role));

  return (
    <DashboardShell title="Users & roles" subtitle="Create staff accounts and review role assignments" active="Users & roles">
      <AdminUserManager currentUserId={user.id} />
    </DashboardShell>
  );
}
