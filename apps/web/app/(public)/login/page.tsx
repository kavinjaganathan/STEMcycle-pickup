import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getLocalDb } from "@/lib/db";
import { env } from "@/lib/env";
import { DevLogin, DriverLogin } from "./LoginForms";

export const metadata: Metadata = {
  title: "Volunteer sign in",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md">
      <p className="eyebrow">Volunteer drivers</p>
      <h1 className="display mt-1 text-4xl">Volunteer sign in</h1>
      <div className="panel mt-8 p-5 sm:p-8">
        <Suspense fallback={null}>
          <DriverLogin />
        </Suspense>
      </div>
      <p className="mt-6 text-sm leading-relaxed text-muted">
        This sign-in is for StemCycle volunteer drivers. Drivers join through an invitation from the
        StemCycle team.
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
