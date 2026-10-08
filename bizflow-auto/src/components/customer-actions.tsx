"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ModuleIcon } from "@/components/module-icon";
import { VehicleMakeModelFields } from "@/components/vehicle-make-model-fields";

type CustomerVehicle = {
  id: number;
  registrationNumber: string;
  make: string;
  model: string;
};

type ServiceOption = {
  id: number;
  name: string;
  price: string | number;
  priceConfigured: boolean;
  category: string;
  vehicleType: string;
  mechanicSpecialty: string;
};

type CustomerActionsProps = {
  vehicles: CustomerVehicle[];
  minAppointmentDate: string;
  maxVehicleYear: number;
};

export function CustomerActions({ vehicles, minAppointmentDate, maxVehicleYear }: CustomerActionsProps) {
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loadingServices, setLoadingServices] = useState(true);

  useEffect(() => {
    let active = true;

    fetch("/api/services", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result: { services?: ServiceOption[]; error?: string } = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Services could not be loaded.");
        if (active) setServices(result.services ?? []);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Services could not be loaded.");
      })
      .finally(() => {
        if (active) setLoadingServices(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function submit(
    event: FormEvent<HTMLFormElement>,
    endpoint: string,
    onSuccess: () => void,
    successMessage: string,
  ) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result: { error?: string; emailNotification?: { sent: boolean; reason: string } } = await response.json();

      if (!response.ok) {
        setError(result.error ?? "The request could not be completed.");
        return;
      }
      form.reset();
      onSuccess();
      setSuccess(
        result.emailNotification && !result.emailNotification.sent
          ? `${successMessage} Email notification was not sent (${result.emailNotification.reason.replaceAll("_", " ")}).`
          : successMessage,
      );
    } catch {
      setError("Could not reach the server. Please try again.");
    }
  }

  return (
    <section className="mb-6 grid gap-6 lg:grid-cols-2">
      <form
        id="add-vehicle"
        className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft"
        onSubmit={(event) =>
          submit(event, "/api/customer/vehicles", () => window.location.reload(), "Vehicle added.")
        }
      >
        <h2 className="flex items-center gap-2 text-xl font-black"><ModuleIcon name="vehicle" />Add car</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="registrationNumber" required maxLength={50} placeholder="Registration number" className="rounded-xl border border-slate-200 px-3 py-2" />
          <VehicleMakeModelFields />
          <input name="year" required type="number" min="1886" max={maxVehicleYear} placeholder="Year" className="rounded-xl border border-slate-200 px-3 py-2" />
          <input name="mileage" type="number" min="0" max="2000000" defaultValue="0" placeholder="Mileage (km)" className="rounded-xl border border-slate-200 px-3 py-2" />
          <input name="color" maxLength={50} placeholder="Color (optional)" className="rounded-xl border border-slate-200 px-3 py-2" />
        </div>
        <button aria-label="Save vehicle" className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"><ModuleIcon name="vehicle" />Save</button>
      </form>

      <form
        id="book-service"
        className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft"
        onSubmit={(event) =>
          submit(event, "/api/customer/appointments", () => window.location.reload(), "Appointment requested.")
        }
      >
        <h2 className="flex items-center gap-2 text-xl font-black"><ModuleIcon name="appointment" />Book service</h2>
        <select name="vehicleId" required disabled={vehicles.length === 0} className="w-full rounded-xl border border-slate-200 px-3 py-2">
          <option value="">Select a vehicle</option>
          {vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.registrationNumber} · {vehicle.make} {vehicle.model}
            </option>
          ))}
        </select>
        <select name="serviceId" required disabled={loadingServices || services.length === 0} className="w-full rounded-xl border border-slate-200 px-3 py-2">
          <option value="">{loadingServices ? "Loading services..." : "Select a service"}</option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name} · {service.vehicleType.toLowerCase()} · {service.mechanicSpecialty} · {service.priceConfigured ? `KSh ${Number(service.price).toLocaleString()}` : "Price after inspection"}
            </option>
          ))}
        </select>
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="date" required type="date" min={minAppointmentDate} className="rounded-xl border border-slate-200 px-3 py-2" />
          <input name="time" required type="time" className="rounded-xl border border-slate-200 px-3 py-2" />
        </div>
        <textarea name="description" maxLength={2000} placeholder="Describe the issue (optional)" className="min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2" />
        <button disabled={vehicles.length === 0 || loadingServices || services.length === 0} className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          <span className="inline-flex items-center gap-2"><ModuleIcon name="appointment" />Book</span>
        </button>
        {vehicles.length === 0 && <p className="text-sm text-amber-700">Add a vehicle before booking an appointment.</p>}
      </form>

      {(error || success) && (
        <p role={error ? "alert" : "status"} className={`lg:col-span-2 rounded-xl p-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {error || success}
        </p>
      )}
    </section>
  );
}
