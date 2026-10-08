import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { QuotationManager } from "@/components/quotation-manager";
import { getSessionUser } from "@/lib/auth";
import { addDaysToDateInputValue, getBusinessDateInputValue } from "@/lib/date-input";
import { getRoleHomePath, hasPermission } from "@/lib/permissions";

export default async function QuotationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "quotations:read")) redirect(getRoleHomePath(user.role));
  const today = getBusinessDateInputValue();

  return (
    <DashboardShell title="Quotations" subtitle="Prepare repair estimates and record customer approval before work begins" active="Quotations">
      <QuotationManager todayDate={today} initialExpiryDate={addDaysToDateInputValue(today, 7)} />
    </DashboardShell>
  );
}
