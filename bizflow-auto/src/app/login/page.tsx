import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-soft">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-xl font-black text-white">
            B
          </div>
          <h1 className="text-3xl font-black text-slate-900">Sign in</h1>
        </div>

        <AuthForm mode="login" />

        <p className="mt-6 text-center text-sm text-slate-500">
          New customer?{" "}
          <Link href="/register" className="font-semibold text-orange-600">
            Register
          </Link>
        </p>
      </div>
    </main>
  );
}
