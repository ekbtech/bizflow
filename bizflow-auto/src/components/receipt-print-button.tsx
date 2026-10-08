"use client";

export function ReceiptPrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white print:hidden">
      Print / Save PDF
    </button>
  );
}
