import type { Metadata } from "next";
import Link from "next/link";
import { AdminLoginForm } from "./AdminLoginForm";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false } };

export default function AdminLoginPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-md flex-1 px-4 py-12">
      <Link href="/" className="text-lg font-extrabold tracking-tight">
        StemCycle
      </Link>
      <p className="eyebrow mt-10">Admin</p>
      <h1 className="display mt-1 text-4xl">Admin sign in</h1>
      <div className="panel mt-8 p-5 sm:p-8">
        <AdminLoginForm />
      </div>
      <p className="mt-6 text-sm text-muted">
        Driving?{" "}
        <Link href="/login" className="font-bold text-ink underline underline-offset-4">
          Driver sign in
        </Link>
      </p>
    </main>
  );
}
