import Link from "next/link";
import { ResetPasswordForm } from "@/components/reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-soft">
        <div className="mb-8 text-center">
          <Link href="/" className="text-sm font-bold text-orange-600">BizFlow Auto</Link>
          <h1 className="mt-4 text-3xl font-black text-slate-900">Set a new password</h1>
          <p className="mt-2 text-sm text-slate-500">Choose a password with at least 6 characters.</p>
        </div>
        <ResetPasswordForm token={token} />
      </div>
    </main>
  );
}
