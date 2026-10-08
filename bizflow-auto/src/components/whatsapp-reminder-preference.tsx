"use client";

import { useState } from "react";
import { ModuleIcon } from "@/components/module-icon";

export function WhatsAppReminderPreference({ initialValue }: { initialValue: boolean }) {
  const [enabled, setEnabled] = useState(initialValue);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function updatePreference() {
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/customer/whatsapp-preference", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappOptIn: !enabled }),
      });
      const result: { error?: string; whatsappOptIn?: boolean } = await response.json();
      if (!response.ok || result.whatsappOptIn === undefined) {
        throw new Error(result.error ?? "WhatsApp preference could not be saved.");
      }
      setEnabled(result.whatsappOptIn);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "WhatsApp preference could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="reminders" className="mb-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="flex items-center gap-2 font-bold"><ModuleIcon name="service" />Reminders</h2>
        <p className="mt-1 text-sm text-slate-500">
          {enabled
            ? "WhatsApp + SMS · On"
            : "WhatsApp + SMS · Off"}
        </p>
        {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      </div>
      <button
        type="button"
        onClick={() => void updatePreference()}
        disabled={saving}
        className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-60"
      >
        {saving ? "Saving…" : enabled ? "Turn off" : "Turn on"}
      </button>
    </section>
  );
}
