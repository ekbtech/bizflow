import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { ReceptionManager } from "@/components/reception-manager";
import { getSessionUser } from "@/lib/auth";
import { getRoleHomePath, hasPermission } from "@/lib/permissions";

type ReceptionPageProps = {
  searchParams: Promise<{ appointmentId?: string | string[] }>;
};

export default async function ReceptionsPage({ searchParams }: ReceptionPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "receptions:read")) redirect(getRoleHomePath(user.role));

  const { appointmentId: rawAppointmentId } = await searchParams;
  const appointmentId = typeof rawAppointmentId === "string" && /^[1-9]\d*$/.test(rawAppointmentId) &&
    Number.isSafeInteger(Number(rawAppointmentId))
    ? Number(rawAppointmentId)
    : null;

  return (
    <DashboardShell
      title="Vehicle Reception"
      subtitle="Record vehicle condition, mileage, fuel, customer complaints, and private photo evidence"
      active="Vehicle Reception"
    >
      <ReceptionManager initialAppointmentId={appointmentId} />
    </DashboardShell>
  );
}
