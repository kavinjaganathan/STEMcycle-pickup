import { Suspense } from "react";
import { connection } from "next/server";
import { PickupForm } from "@/components/PickupForm";
import { getRepo } from "@/lib/db";

export default function Home() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16">
      <section aria-labelledby="hero-title" className="lg:sticky lg:top-8 lg:self-start">
        <p className="eyebrow">Textbook pickup · Frisco, Plano, McKinney</p>
        <h1 id="hero-title" className="display mt-2 text-4xl sm:text-5xl lg:text-6xl">
          Donate your used textbooks.
        </h1>
        <p className="mt-5 max-w-[50ch] text-lg leading-relaxed text-muted">
          A StemCycle volunteer picks them up from your doorstep on a weekend, and we donate them to
          students in rural communities. Booking takes about two minutes.
        </p>
        <dl className="mt-8 grid grid-cols-3 border-t border-ink pt-4">
          <Fact term="When" value="Weekends" />
          <Fact term="Window" value="1 hour" />
          <Fact term="Cost" value="Free" />
        </dl>
      </section>
      <section aria-label="Pickup request form" className="panel p-5 sm:p-8">
        <Suspense fallback={<p className="text-muted">Loading pickup times…</p>}>
          <FormWithSlots />
        </Suspense>
      </section>
    </div>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{term}</dt>
      <dd className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">{value}</dd>
    </div>
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
