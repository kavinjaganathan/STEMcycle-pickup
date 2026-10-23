import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getLocalDb } from "@/lib/db";
import { env } from "@/lib/env";
import { DevLogin, SupabaseLogin } from "./LoginForms";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function LoginPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-sm flex-1 px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Volunteer sign in</h1>
      <p className="mt-1 text-sm text-muted">For StemCycle admins and drivers.</p>
      <div className="mt-6 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <LoginChooser />
        </Suspense>
      </div>
    </main>
  );
}

async function LoginChooser() {
  await connection();
  const auth = await getAuth();
  if (auth) redirect(auth.user.role === "admin" ? "/admin" : "/driver");

  if (env.dataBackend === "supabase") return <SupabaseLogin />;

  const db = await getLocalDb();
  const { rows } = await db.query<{ id: string; email: string; role: string; full_name: string }>(
    `select p.id, u.email, p.role, p.full_name from profiles p join auth.users u on u.id = p.id
     where p.active order by p.role, p.full_name`,
  );
  return <DevLogin users={rows} />;
}
