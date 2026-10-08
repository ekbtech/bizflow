"use client";

import { useEffect, useState, type FormEvent } from "react";
import { inspectionChecklist, inspectionStatuses } from "@/lib/inspection-checklist";

type AppointmentRef = {
  id: number;
  status: string;
  service: { name: string };
  jobCard: { id: number } | null;
};

type Reception = {
  id: number;
  receptionNumber: string;
  mileage: number;
  customer: { name: string };
  vehicle: { id: number; registrationNumber: string; make: string; model: string };
  appointment: AppointmentRef | null;
};

type InspectionItem = {
  category: string;
  name: string;
  status: typeof inspectionStatuses[number];
  notes: string | null;
};

type Inspection = {
  id: number;
  receptionId: number;
  inspectionNumber: string;
  mileage: number;
  notes: string | null;
  reception: Reception;
  inspectedBy: { name: string };
  items: InspectionItem[];
  images: { id: number; fileName: string; mimeType: string; sizeBytes: number }[];
};

type ChecklistValues = Record<string, { status: typeof inspectionStatuses[number]; notes: string }>;
type InspectionResponse = { inspections?: Inspection[]; eligibleReceptions?: Reception[]; error?: string };

function itemKey(category: string, name: string) {
  return `${category}\u0000${name}`;
}

function emptyChecklist(): ChecklistValues {
  return Object.fromEntries(inspectionChecklist.flatMap(({ category, items }) =>
    items.map((name) => [itemKey(category, name), { status: "NOT_CHECKED" as const, notes: "" }]),
  ));
}

export function InspectionManager() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [eligibleReceptions, setEligibleReceptions] = useState<Reception[]>([]);
  const [selectedReceptionId, setSelectedReceptionId] = useState<number | null>(null);
  const [mileage, setMileage] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ChecklistValues>(emptyChecklist);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadInspections() {
    const response = await fetch("/api/inspections", { credentials: "same-origin", cache: "no-store" });
    const result: InspectionResponse = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Inspection records could not be loaded.");
    setInspections(result.inspections ?? []);
    setEligibleReceptions(result.eligibleReceptions ?? []);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/inspections", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result: InspectionResponse = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Inspection records could not be loaded.");
        if (active) {
          setInspections(result.inspections ?? []);
          setEligibleReceptions(result.eligibleReceptions ?? []);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Inspection records could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectableReceptions = [
    ...eligibleReceptions,
    ...inspections
      .filter((inspection) => ["CHECKED_IN", "IN_SERVICE"].includes(inspection.reception.appointment?.status ?? ""))
      .map((inspection) => inspection.reception),
  ].filter((reception, index, all) => all.findIndex((item) => item.id === reception.id) === index);

  function selectReception(value: string) {
    const receptionId = Number(value) || null;
    setSelectedReceptionId(receptionId);
    const reception = selectableReceptions.find((item) => item.id === receptionId);
    const existing = inspections.find((inspection) => inspection.receptionId === receptionId);
    setMileage(String(existing?.mileage ?? reception?.mileage ?? ""));
    setNotes(existing?.notes ?? "");
    const values = emptyChecklist();
    for (const item of existing?.items ?? []) {
      values[itemKey(item.category, item.name)] = { status: item.status, notes: item.notes ?? "" };
    }
    setItems(values);
  }

  async function saveInspection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!selectedReceptionId) {
      setError("Select a checked-in vehicle reception.");
      return;
    }
    const formData = new FormData(form);
    const submission = new FormData();
    submission.set("inspection", JSON.stringify({
      receptionId: selectedReceptionId,
      mileage: Number(mileage),
      notes,
      items: inspectionChecklist.flatMap(({ category, items: categoryItems }) =>
        categoryItems.map((name) => ({
          category,
          name,
          status: items[itemKey(category, name)].status,
          notes: items[itemKey(category, name)].notes,
        })),
      ),
    }));
    for (const photo of formData.getAll("photos")) {
      if (photo instanceof File && photo.size > 0) submission.append("photos", photo);
    }

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/inspections", {
        method: "POST",
        credentials: "same-origin",
        body: submission,
      });
      const result: { inspection?: { inspectionNumber: string }; error?: string } = await response.json();
      if (!response.ok || !result.inspection) throw new Error(result.error ?? "Inspection could not be saved.");
      setSuccess(`${result.inspection.inspectionNumber} saved.`);
      setSelectedReceptionId(null);
      setMileage("");
      setNotes("");
      setItems(emptyChecklist());
      form.reset();
      await loadInspections();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Inspection could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="rounded-xl bg-white p-5 text-sm text-slate-500">Loading vehicle inspections…</p>;

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}

      <form onSubmit={(event) => void saveInspection(event)} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <div>
          <h2 className="text-xl font-black">Digital vehicle inspection</h2>
          <p className="mt-1 text-sm text-slate-500">Record every checklist item as good, requiring attention, critical, or not checked.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Checked-in reception
            <select required value={selectedReceptionId ?? ""} onChange={(event) => selectReception(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2">
              <option value="">Select vehicle reception</option>
              {selectableReceptions.map((reception) => (
                <option key={reception.id} value={reception.id}>
                  {reception.receptionNumber} · {reception.customer.name} · {reception.vehicle.registrationNumber}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Inspection mileage (km)
            <input required type="number" min="0" max="2000000" value={mileage} onChange={(event) => setMileage(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2" />
          </label>
          {selectedReceptionId && (() => {
            const reception = selectableReceptions.find((item) => item.id === selectedReceptionId);
            return reception ? <p className="self-end pb-2 text-sm text-slate-500 sm:col-span-2">{reception.vehicle.make} {reception.vehicle.model} · {reception.appointment?.service.name}</p> : null;
          })()}
        </div>

        {inspectionChecklist.map(({ category, items: categoryItems }) => (
          <section key={category} className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-3 font-bold">{category}</h3>
            <div className="space-y-3">
              {categoryItems.map((name) => {
                const key = itemKey(category, name);
                const value = items[key];
                return (
                  <div key={key} className="grid gap-2 sm:grid-cols-[1fr_200px_1fr] sm:items-center">
                    <span className="text-sm font-medium">{name}</span>
                    <select value={value.status} onChange={(event) => {
                      const status = inspectionStatuses.find((knownStatus) => knownStatus === event.target.value);
                      if (!status) return;
                      setItems((current) => ({
                        ...current,
                        [key]: { ...current[key], status },
                      }));
                    }} aria-label={`${name} inspection status`} className="rounded-lg border border-slate-200 px-2 py-2 text-sm">
                      {inspectionStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ").toLowerCase()}</option>)}
                    </select>
                    <input value={value.notes} onChange={(event) => setItems((current) => ({
                      ...current,
                      [key]: { ...current[key], notes: event.target.value },
                    }))} maxLength={2000} aria-label={`${name} inspection notes`} placeholder="Notes (optional)" className="rounded-lg border border-slate-200 px-2 py-2 text-sm" />
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Overall inspection notes
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={5000} className="min-h-20 rounded-xl border border-slate-200 px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Inspection photos (optional; JPEG, PNG, or WebP; max 5 images / 15 MB total)
          <input name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <button disabled={busy || !selectedReceptionId} className="rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Saving inspection…" : inspections.some((inspection) => inspection.receptionId === selectedReceptionId) ? "Update inspection" : "Save inspection"}
        </button>
      </form>

      <section className="space-y-3">
        <h2 className="text-xl font-black">Inspection history</h2>
        {inspections.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">No inspection records yet.</p>}
        {inspections.map((inspection) => (
          <article key={inspection.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-orange-600">{inspection.inspectionNumber} · {inspection.reception.receptionNumber}</p>
                <h3 className="mt-1 font-bold">{inspection.reception.vehicle.make} {inspection.reception.vehicle.model} · {inspection.reception.vehicle.registrationNumber}</h3>
                <p className="text-sm text-slate-600">{inspection.reception.customer.name} · {inspection.mileage.toLocaleString()} km · inspected by {inspection.inspectedBy.name}</p>
              </div>
              <p className="text-sm text-slate-600">{inspection.items.filter((item) => item.status === "CRITICAL").length} critical · {inspection.items.filter((item) => item.status === "ATTENTION_REQUIRED").length} require attention</p>
            </div>
            {inspection.notes && <p className="mt-3 text-sm">{inspection.notes}</p>}
            <ul className="mt-3 grid gap-2 border-t border-slate-100 pt-3 text-sm sm:grid-cols-2">
              {inspection.items.filter((item) => item.status !== "GOOD" && item.status !== "NOT_CHECKED").map((item) => (
                <li key={`${item.category}-${item.name}`}>
                  <strong>{item.category} · {item.name}:</strong> {item.status.replaceAll("_", " ").toLowerCase()}
                  {item.notes && ` — ${item.notes}`}
                </li>
              ))}
            </ul>
            {inspection.images.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-3 text-sm">
                {inspection.images.map((image) => (
                  <li key={image.id}>
                    <a href={`/api/inspections/${inspection.id}/images/${image.id}`} target="_blank" rel="noreferrer" className="font-semibold text-orange-700 hover:underline">
                      View {image.fileName}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
