import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getLocalDb } from "@/lib/db";
import { env } from "@/lib/env";
import { DevLogin, DriverLogin } from "./LoginForms";

export const metadata: Metadata = { title: "Driver sign in" };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md">
      <p className="eyebrow">Volunteer drivers</p>
      <h1 className="display mt-1 text-4xl">Sign in</h1>
      <div className="panel mt-8 p-5 sm:p-8">
        <Suspense fallback={null}>
          <DriverLogin />
        </Suspense>
      </div>
      <p className="mt-6 text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="font-bold text-ink underline underline-offset-4">
          Sign up to drive
        </Link>
        <span aria-hidden="true"> · </span>
        <Link href="/admin/login" className="font-bold text-ink underline underline-offset-4">
          Admin sign in
        </Link>
      </p>
      <Suspense fallback={null}>
        <LocalUsers />
      </Suspense>
    </div>
  );
}

async function LocalUsers() {
  await connection();
  if (env.dataBackend !== "local" || env.isHosted) return null;
  const db = await getLocalDb();
  const { rows } = await db.query<{ id: string; full_name: string; status: string }>(
    "select id, full_name, status from profiles where full_name <> '' order by status, full_name limit 10",
  );
  return (
    <div className="mt-10">
      <DevLogin users={rows} />
    </div>
  );
}
