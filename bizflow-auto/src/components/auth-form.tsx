"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { UserRole } from "@/lib/auth";
import { getRoleHomePath } from "@/lib/permissions";

type AuthFormProps = {
  mode: "login" | "register";
};

type AuthResponse = {
  error?: string;
  user?: {
    role: UserRole;
  };
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const payload = {
      ...Object.fromEntries(formData.entries()),
      ...(mode === "register" ? { whatsappOptIn: formData.has("whatsappOptIn") } : {}),
    };

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result: AuthResponse = await response.json();

      if (!response.ok) {
        setError(result.error ?? "Unable to complete the request.");
        return;
      }

      if (!result.user) {
        setError("The server did not return an account.");
        return;
      }

      const sessionResponse = await fetch("/api/auth/session", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!sessionResponse.ok) {
        setError("Sign-in succeeded, but this browser did not keep the session. Check browser cookie settings and try again.");
        return;
      }

      router.replace(getRoleHomePath(result.user.role));
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {mode === "register" && (
        <>
          <div>
            <label htmlFor="name" className="mb-2 block text-sm font-semibold text-slate-700">
              Full name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              minLength={2}
              maxLength={255}
              placeholder="John Bett"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-orange-400 focus:bg-white"
            />
          </div>
          <div>
            <label htmlFor="username" className="mb-2 block text-sm font-semibold text-slate-700">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              minLength={3}
              maxLength={50}
              pattern="[A-Za-z0-9._-]+"
              placeholder="john.bett"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-orange-400 focus:bg-white"
            />
          </div>
          <div>
            <label htmlFor="phone" className="mb-2 block text-sm font-semibold text-slate-700">
              Phone number
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              required
              minLength={5}
              maxLength={50}
              placeholder="0712 345678"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-orange-400 focus:bg-white"
            />
          </div>
          <label className="flex items-start gap-3 text-sm text-slate-600">
            <input name="whatsappOptIn" type="checkbox" className="mt-1 accent-orange-500" />
            <span>I agree to receive WhatsApp and SMS service reminders from BizFlow Auto at this phone number. I can opt out at any time.</span>
          </label>
        </>
      )}

      <div>
        <label htmlFor={mode === "login" ? "identifier" : "email"} className="mb-2 block text-sm font-semibold text-slate-700">
          {mode === "login" ? "Username, full name, or email" : "Email"}
        </label>
        <input
          id={mode === "login" ? "identifier" : "email"}
          name={mode === "login" ? "identifier" : "email"}
          type={mode === "login" ? "text" : "email"}
          autoComplete={mode === "login" ? "username" : "email"}
          required
          maxLength={255}
          placeholder="you@example.com"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-orange-400 focus:bg-white"
        />
      </div>

      <div>
          <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
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
          {mode === "login" && (
            <div className="mt-2 text-right">
              <Link href="/forgot-password" className="text-sm font-semibold text-orange-700 hover:underline">
                Forgot password?
              </Link>
            </div>
          )}
          </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
      >
        {isSubmitting ? "Please wait..." : mode === "login" ? "Login" : "Create customer account"}
      </button>
    </form>
  );
}
