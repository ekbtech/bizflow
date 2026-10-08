"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ModuleIcon, type ModuleIconName } from "@/components/module-icon";

type SearchResult = {
  label: string;
  detail: string;
  category: string;
  href: string;
  icon: ModuleIconName;
};

export function DashboardSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(normalized)}`, {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        const payload: { results?: SearchResult[]; error?: string } = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Search could not be completed.");
        setResults(payload.results ?? []);
      } catch (searchError) {
        if (searchError instanceof DOMException && searchError.name === "AbortError") return;
        setError(searchError instanceof Error ? searchError.message : "Search could not be completed.");
        setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  const showResults = open && query.trim().length >= 2;

  return (
    <div className="relative min-w-0 flex-1">
      <label htmlFor="dashboard-search" className="sr-only">Search vehicles, customers, and jobs</label>
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-blue-400 focus-within:bg-white">
        <ModuleIcon name="search" className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          id="dashboard-search"
          type="search"
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            if (value.trim().length < 2) {
              setResults([]);
              setError("");
              setLoading(false);
            }
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          placeholder="Search vehicle, customer, job..."
          className="w-full bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
          autoComplete="off"
        />
        {loading && <span className="shrink-0 text-[10px] text-slate-400">Searching</span>}
      </div>
      {showResults && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          {error ? (
            <p role="alert" className="px-3 py-2 text-xs text-red-700">{error}</p>
          ) : results.length > 0 ? (
            <ul aria-label="Search results">
              {results.map((result, index) => (
                <li key={`${result.category}-${result.href}-${index}`}>
                  <Link href={result.href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                      <ModuleIcon name={result.icon} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-slate-800">{result.label}</span>
                      <span className="block truncate text-[10px] text-slate-500">{result.detail}</span>
                    </span>
                    <span className="text-[10px] font-medium text-slate-400">{result.category}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : !loading ? (
            <p className="px-3 py-2 text-xs text-slate-500">No matching records found.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
