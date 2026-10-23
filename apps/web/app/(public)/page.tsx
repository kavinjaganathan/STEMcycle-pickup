import { Suspense } from "react";
import { connection } from "next/server";
import { PickupForm } from "@/components/PickupForm";
import { getRepo } from "@/lib/db";

export default function Home() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Donate your used textbooks</h1>
      <p className="mt-2 text-muted">
        We pick up from your doorstep in Frisco, Plano, McKinney and nearby cities, then donate the
        books to students in rural communities. It takes about two minutes.
      </p>
      <div className="mt-6 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        <Suspense fallback={<p className="text-muted">Loading pickup windows…</p>}>
          <FormWithSlots />
        </Suspense>
      </div>
    </>
  );
}

async function FormWithSlots() {
  await connection();
  const repo = await getRepo();
  const [settings, slots] = await Promise.all([
    repo.getPublicSettings(),
    repo.listAvailableSlots(new Date()),
  ]);
  return (
    <PickupForm
      initialSlots={slots}
      zipAllowlist={settings.zip_allowlist}
      turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
    />
  );
}
