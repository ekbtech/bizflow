import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ReceiptPrintButton } from "@/components/receipt-print-button";
import { getSessionUser } from "@/lib/auth";
import { getRoleHomePath, hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type PageProps = { params: Promise<{ id: string }> };

function money(value: number) {
  return `KSh ${value.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function ReceiptPage({ params }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id: rawId } = await params;
  if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) notFound();

  const receipt = await prisma.paymentReceipt.findUnique({
    where: { id: Number(rawId) },
    include: {
      issuedBy: { select: { name: true } },
      payment: {
        include: {
          invoice: {
            include: {
              customer: { select: { userId: true, name: true, phone: true, email: true } },
              vehicle: { select: { registrationNumber: true, make: true, model: true } },
              payments: { where: { status: "PAID" }, select: { amount: true } },
            },
          },
        },
      },
    },
  });
  if (!receipt || receipt.payment.status !== "PAID") notFound();
  if (user.role === "CUSTOMER") {
    if (receipt.payment.invoice.customer.userId !== user.id) notFound();
  } else if (!hasPermission(user.role, "payments:read")) {
    redirect(getRoleHomePath(user.role));
  }

  const invoicePaid = receipt.payment.invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const backHref = user.role === "CUSTOMER" ? "/customer/dashboard" : "/payments";

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <Link href={backHref} className="text-sm font-semibold text-orange-700">← Back</Link>
          <ReceiptPrintButton />
        </div>
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft sm:p-10">
          <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-orange-600">BizFlow Auto</p>
              <h1 className="mt-2 text-3xl font-black">Payment receipt</h1>
              <p className="mt-1 text-sm text-slate-500">Official record of payment received</p>
            </div>
            <div className="sm:text-right">
              <p className="font-bold">{receipt.receiptNumber}</p>
              <p className="text-sm text-slate-500">Issued {receipt.issuedAt.toLocaleString()}</p>
            </div>
          </header>
          <dl className="grid gap-x-8 gap-y-4 border-b border-slate-200 py-5 sm:grid-cols-2">
            <div><dt className="text-xs font-semibold uppercase text-slate-500">Received from</dt><dd className="mt-1 font-semibold">{receipt.payment.invoice.customer.name}</dd><dd className="text-sm text-slate-600">{receipt.payment.invoice.customer.phone}</dd></div>
            <div><dt className="text-xs font-semibold uppercase text-slate-500">Vehicle</dt><dd className="mt-1 font-semibold">{receipt.payment.invoice.vehicle.registrationNumber}</dd><dd className="text-sm text-slate-600">{receipt.payment.invoice.vehicle.make} {receipt.payment.invoice.vehicle.model}</dd></div>
            <div><dt className="text-xs font-semibold uppercase text-slate-500">Invoice</dt><dd className="mt-1 font-semibold">INV-{receipt.payment.invoice.id}</dd></div>
            <div><dt className="text-xs font-semibold uppercase text-slate-500">Payment date</dt><dd className="mt-1 font-semibold">{receipt.payment.paymentDate.toLocaleString()}</dd></div>
          </dl>
          <div className="space-y-2 py-5">
            <div className="flex justify-between gap-4 text-sm"><span>Amount received</span><strong>{money(Number(receipt.payment.amount))}</strong></div>
            <div className="flex justify-between gap-4 text-sm"><span>Payment method</span><strong>{receipt.payment.paymentMethod.replace("_", "-")}</strong></div>
            <div className="flex justify-between gap-4 text-sm"><span>Transaction reference</span><strong>{receipt.payment.transactionReference ?? "—"}</strong></div>
            <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-sm"><span>Invoice total</span><strong>{money(Number(receipt.payment.invoice.totalAmount))}</strong></div>
            <div className="flex justify-between gap-4 text-sm"><span>Total paid to date</span><strong>{money(invoicePaid)}</strong></div>
            <div className="flex justify-between gap-4 text-sm"><span>Remaining balance</span><strong>{money(Math.max(0, Number(receipt.payment.invoice.totalAmount) - invoicePaid))}</strong></div>
          </div>
          <footer className="border-t border-slate-200 pt-4 text-xs text-slate-500">
            {receipt.issuedBy ? `Recorded by ${receipt.issuedBy.name}. ` : ""}
            Thank you for choosing BizFlow Auto.
          </footer>
        </article>
      </div>
    </main>
  );
}
