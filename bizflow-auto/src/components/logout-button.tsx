"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ModuleIcon } from "@/components/module-icon";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function logout() {
    setError("");

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        setError("Logout failed. Please try again.");
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={logout}
        aria-label="Sign out"
        title="Sign out"
        className={compact
          ? "rounded-lg p-2 text-slate-300 transition hover:bg-slate-700 hover:text-white"
          : "rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"}
      >
        <span className="inline-flex items-center gap-2">
          <ModuleIcon name="logout" />
          {!compact && <span>Exit</span>}
        </span>
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}
    </div>
  );
}
