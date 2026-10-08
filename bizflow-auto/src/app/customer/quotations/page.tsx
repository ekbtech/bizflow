import { redirect } from "next/navigation";
import { CustomerQuotationManager } from "@/components/customer-quotation-manager";
import { DashboardShell } from "@/components/dashboard-shell";
import { getSessionUser } from "@/lib/auth";
import { getRoleHomePath } from "@/lib/permissions";

export default async function CustomerQuotationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "CUSTOMER") redirect(getRoleHomePath(user.role));

  return (
    <DashboardShell title="Quotes" subtitle="Review and approve work" active="Quotes">
      <CustomerQuotationManager />
    </DashboardShell>
  );
}
