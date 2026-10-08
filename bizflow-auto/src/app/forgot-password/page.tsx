import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-soft">
        <div className="mb-8 text-center">
          <Link href="/" className="text-sm font-bold text-orange-600">BizFlow Auto</Link>
          <h1 className="mt-4 text-3xl font-black text-slate-900">Forgot password?</h1>
          <p className="mt-2 text-sm text-slate-500">Enter your account email and we&apos;ll send a reset link.</p>
        </div>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
