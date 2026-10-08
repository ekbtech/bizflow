import { DashboardShell } from "@/components/dashboard-shell";
import { PaymentManager } from "@/components/payment-manager";

export default function PaymentsPage() {
  return (
    <DashboardShell
      title="Payments"
      subtitle="Record payments, track balances, and review transaction history"
      active="Payments"
    >
      <PaymentManager />
    </DashboardShell>
  );
}
