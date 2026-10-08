import { DashboardShell } from "@/components/dashboard-shell";
import { InvoiceManager } from "@/components/invoice-manager";

export default function InvoicesPage() {
  return (
    <DashboardShell
      title="Invoices"
      subtitle="Review completed-job invoices, balances, and printable receipts"
      active="Invoices"
    >
      <InvoiceManager />
    </DashboardShell>
  );
}
