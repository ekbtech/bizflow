import { DashboardShell } from "@/components/dashboard-shell";
import { AppointmentManager } from "@/components/appointment-manager";
import { getBusinessDateInputValue } from "@/lib/date-input";

export default function AppointmentsPage() {
  const todayDate = getBusinessDateInputValue();

  return (
    <DashboardShell
      title="Appointments"
      subtitle="Schedule bookings, assign advisors and mechanics, and follow each appointment through service"
      active="Appointments"
    >
      <AppointmentManager todayDate={todayDate} />
    </DashboardShell>
  );
}
