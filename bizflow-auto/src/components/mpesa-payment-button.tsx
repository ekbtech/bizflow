"use client";

import { useState, type FormEvent } from "react";

export function MpesaPaymentButton({ invoiceId }: { invoiceId: number }) {
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function startPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const response = await fetch("/api/payments/mpesa", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, phone }),
      });
      const result: { error?: string; message?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "M-Pesa payment could not be started.");
      setMessage(result.message ?? "Payment request sent.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "M-Pesa payment could not be started.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void startPayment(event)} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="text-xs font-semibold text-slate-600">
        M-Pesa phone number
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          required
          type="tel"
          autoComplete="tel"
          placeholder="0712 345678"
          className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"
        />
      </label>
      <button disabled={busy} className="w-fit rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? "Sending prompt…" : "Pay with M-Pesa"}
      </button>
      {message && <p role="status" className="text-sm text-emerald-700">{message} Refresh this page after completing the prompt.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
