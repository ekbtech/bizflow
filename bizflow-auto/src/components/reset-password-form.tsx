"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

export function ResetPasswordForm({ token }: { token: string }) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);
    const password = new FormData(event.currentTarget).get("password");
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const result: { error?: string; message?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Password could not be reset.");
      setMessage(result.message ?? "Password reset. You can now sign in.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Password could not be reset.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">This reset link is invalid. Request a new one.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700">New password</label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={6}
            maxLength={128}
            placeholder="At least 6 characters"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-12 outline-none transition focus:border-orange-400 focus:bg-white"
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 hover:text-slate-900"
          >
            {showPassword ? (
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A10.8 10.8 0 0112 5c5 0 8.5 4.2 9.5 7-.4 1.1-1.3 2.4-2.6 3.6M6.2 6.2C3.9 7.6 2.7 9.7 2.5 12c.6 1.7 2.1 3.6 4.4 5.1A9.8 9.8 0 0012 19c1.1 0 2.2-.2 3.2-.6" />
              </svg>
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>}
      {!message && (
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isSubmitting ? "Saving..." : "Reset password"}
        </button>
      )}
      <p className="text-center text-sm text-slate-500"><Link href="/login" className="font-semibold text-orange-700 hover:underline">Back to login</Link></p>
    </form>
  );
}
