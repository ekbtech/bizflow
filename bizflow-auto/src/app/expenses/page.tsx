import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { ExpenseManager } from "@/components/expense-manager";
import { getSessionUser } from "@/lib/auth";
import { getBusinessDateInputValue } from "@/lib/date-input";
import { getRoleHomePath, hasPermission } from "@/lib/permissions";

export default async function ExpensesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "expenses:manage")) redirect(getRoleHomePath(user.role));
  const todayDate = getBusinessDateInputValue();

  return (
    <DashboardShell title="Expenses" subtitle="Record operating expenses and review garage spending" active="Expenses">
      <ExpenseManager todayDate={todayDate} />
    </DashboardShell>
  );
}
