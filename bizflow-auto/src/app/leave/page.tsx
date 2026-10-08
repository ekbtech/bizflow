import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { LeaveRequestManager } from "@/components/leave-request-manager";
import { getSessionUser } from "@/lib/auth";
import { getBusinessDateInputValue } from "@/lib/date-input";
import { getRoleHomePath, hasPermission } from "@/lib/permissions";

export default async function LeavePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const canManage = hasPermission(user.role, "leave:manage");
  const todayDate = getBusinessDateInputValue();
  if (!canManage && !hasPermission(user.role, "leave:apply")) redirect(getRoleHomePath(user.role));

  return (
    <DashboardShell title="Leave" subtitle="Apply and review leave" active="Leave">
      <LeaveRequestManager canManage={canManage} currentUserId={user.id} currentUserName={user.name} todayDate={todayDate} />
    </DashboardShell>
  );
}
