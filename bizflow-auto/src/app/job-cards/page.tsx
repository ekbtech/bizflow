import { DashboardShell } from "@/components/dashboard-shell";
import { JobWorkboard } from "@/components/job-workboard";

export default function JobCardsPage() {
  return (
    <DashboardShell title="Workshop Board" subtitle="Track inspection, diagnosis, approval, repair, quality, invoice and delivery" active="Job Cards">
      <JobWorkboard />
    </DashboardShell>
  );
}
