import { DashboardShell } from "@/components/dashboard-shell";
import { ReportsDashboard } from "@/components/reports-dashboard";
import { getBusinessDateInputValue } from "@/lib/date-input";

export default function ReportsPage() {
  const today = getBusinessDateInputValue();

  return (
    <DashboardShell
      title="Reports"
      subtitle="Review revenue, vehicle, appointment, and service performance"
      active="Reports"
    >
      <ReportsDashboard initialFrom={`${today.slice(0, 7)}-01`} initialTo={today} />
    </DashboardShell>
  );
}
