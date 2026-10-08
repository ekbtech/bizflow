const iconPaths = {
  home: "M3 10.5 12 3l9 7.5M5 9v12h14V9M9 21v-7h6v7",
  report: "M4 19V5m0 14h16M8 15l3-4 3 2 5-7",
  customer: "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-7a4 4 0 0 1 0 7m2 4a4 4 0 0 1 3 4v2",
  vehicle: "M3 13l2-6h14l2 6v6h-3v-2H6v2H3v-6Zm2 0h14M7 10h.01M17 10h.01",
  mechanic: "M14.7 6.3a5 5 0 0 0-6.4 6.4L3 18l3 3 5.3-5.3a5 5 0 0 0 6.4-6.4L15 12l-3-3 2.7-2.7Z",
  service: "M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  appointment: "M8 3v4m8-4v4M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Zm3 8h3m-3 4h8",
  reception: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-7h6v7M8 9h.01M16 9h.01",
  inspection: "m9 11 2 2 4-4m5 3a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  quote: "M7 3h10l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm10 0v5h4M9 13h6m-6 4h6",
  job: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  parts: "M12 3 3 8l9 5 9-5-9-5Zm-9 5v8l9 5 9-5V8M12 13v8",
  procurement: "M3 4h2l2 12h11l3-8H6m3 12h.01M17 20h.01",
  invoice: "M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6m-6 4h4",
  payment: "M3 6h18v13H3zM3 10h18m-14 5h4",
  expense: "M12 2v20m5-16H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  users: "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm9-2v6m-3-3h6",
  audit: "M4 4h16v16H4zM8 8h8m-8 4h8m-8 4h5",
  leave: "M8 3v4m8-4v4M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Zm3 8h3m-3 4h6",
  logout: "M10 17l5-5-5-5m5 5H3m9-9h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7",
  search: "m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z",
} as const;

export type ModuleIconName = keyof typeof iconPaths;

export function ModuleIcon({ name, className = "h-4 w-4" }: { name: ModuleIconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}
