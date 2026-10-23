import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Spinner } from "@/components/ui";
import { getAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { AccountForm } from "./AccountForm";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Account />
    </Suspense>
  );
}

async function Account() {
  await connection();
  const auth = await getAuth();
  if (!auth) redirect("/login");
  const nav =
    auth.user.role === "admin"
      ? [{ href: "/admin", label: "Back to dashboard" }]
      : [{ href: "/driver", label: "My route" }];
  return (
    <AppShell nav={nav} userName={auth.user.full_name || auth.user.email}>
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-muted">
          Signed in as {auth.user.email} ({auth.user.role}).
        </p>
        <AccountForm passwordsEnabled={env.dataBackend === "supabase"} />
      </div>
    </AppShell>
  );
}
