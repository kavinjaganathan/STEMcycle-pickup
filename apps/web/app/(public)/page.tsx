import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { PickupForm } from "@/components/PickupForm";
import { getRepo } from "@/lib/db";
import { TEXTBOOK_LABEL } from "@/lib/format";
import { TEXTBOOK_TYPES } from "@/lib/shared";

const STEPS = [
  [
    "Pick a weekend hour",
    "Choose a 1-hour window on a Saturday or Sunday. We only offer times when a volunteer driver is free.",
  ],
  [
    "Leave the books out",
    "Put them in boxes or bags by your front door before your hour starts. Your confirmation email has a link to cancel if plans change.",
  ],
  [
    "We take it from there",
    "A StemCycle volunteer collects them, and we donate them to students in rural communities.",
  ],
] as const;

export default function Home() {
  return (
    <>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16">
        <section aria-labelledby="hero-title" className="lg:sticky lg:top-8 lg:self-start">
          <p className="eyebrow">Textbook pickup · Frisco, Plano, McKinney</p>
          <h1 id="hero-title" className="display mt-2 text-4xl sm:text-5xl lg:text-6xl">
            Donate your used textbooks.
          </h1>
          <p className="mt-5 max-w-[50ch] text-lg leading-relaxed text-muted">
            A StemCycle volunteer picks them up from your doorstep on a weekend, and we donate them
            to students in rural communities. Booking takes about two minutes.
          </p>
          <a
            href="#schedule"
            className="mt-6 inline-flex min-h-12 items-center rounded-[2px] border border-ink bg-ink px-6 font-bold text-white transition-colors hover:border-brand-strong hover:bg-brand-strong lg:hidden"
          >
            Schedule a pickup
          </a>
          <dl className="mt-8 grid grid-cols-3 border-t border-ink pt-4">
            <Fact term="When" value="Weekends" />
            <Fact term="Window" value="1 hour" />
            <Fact term="Cost" value="Free" />
          </dl>
        </section>
        <section
          id="schedule"
          aria-labelledby="schedule-title"
          className="panel scroll-mt-6 p-5 sm:p-8"
        >
          <h2 id="schedule-title" className="display mb-5 text-2xl">
            Schedule a pickup
          </h2>
          <Suspense fallback={<p className="text-muted">Loading pickup times…</p>}>
            <FormWithSlots />
          </Suspense>
        </section>
      </div>

      <section aria-labelledby="how-title" className="mt-16 border-t border-ink pt-8 sm:mt-24">
        <p className="eyebrow">How it works</p>
        <h2 id="how-title" className="display mt-1 text-3xl">
          Three steps, no account needed.
        </h2>
        <ol className="mt-8 grid gap-8 md:grid-cols-3">
          {STEPS.map(([title, body], i) => (
            <li key={title}>
              <span className="text-3xl font-black text-brand" aria-hidden="true">
                {i + 1}
              </span>
              <h3 className="mt-2 text-lg font-bold">{title}</h3>
              <p className="mt-2 leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="accept-title"
        className="mt-16 grid gap-8 border-t border-line pt-8 md:grid-cols-2"
      >
        <div>
          <h2 id="accept-title" className="text-xl font-extrabold tracking-tight">
            What we collect
          </h2>
          <p className="mt-2 leading-relaxed text-muted">
            Used textbooks of every level. Tell us roughly how many and what kind when you book.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {TEXTBOOK_TYPES.map((t) => (
              <li key={t} className="border border-field px-2 py-1 text-sm font-semibold">
                {TEXTBOOK_LABEL[t]}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Questions?</h2>
          <p className="mt-2 leading-relaxed text-muted">
            Not sure if we pick up near you, or have a lot of books? We&apos;re happy to help.
          </p>
          <Link
            href="/contact"
            className="mt-4 inline-flex min-h-11 items-center rounded-[2px] border border-ink px-5 text-sm font-bold transition-colors hover:bg-ink hover:text-white"
          >
            Contact us
          </Link>
        </div>
      </section>
    </>
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
