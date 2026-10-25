import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Drive with us" };

const STEPS = [
  ["Sign up", "Tell us your name, phone and how many boxes your vehicle holds."],
  ["Get approved", "An admin checks your details and turns your account on."],
  ["Add your hours", "Pick the weekend hours you can drive, like Sat 10–1 or Sun 1–4."],
  ["Follow your route", "We build an optimized route automatically. Open it on your phone."],
] as const;

export default function DrivePage() {
  return (
    <div className="max-w-3xl">
      <p className="eyebrow">Volunteer drivers</p>
      <h1 className="display mt-2 text-4xl sm:text-5xl">Drive with StemCycle.</h1>
      <p className="mt-5 max-w-[56ch] text-lg leading-relaxed text-muted">
        Spend a few weekend hours collecting textbooks from doorsteps around Frisco, Plano and
        McKinney. You choose when; we plan the stops.
      </p>
      <ol className="mt-10 border-t border-ink">
        {STEPS.map(([title, body], i) => (
          <li
            key={title}
            className="grid grid-cols-[2.5rem_1fr] gap-x-4 border-b border-line py-5 sm:grid-cols-[3rem_12rem_1fr]"
          >
            <span className="text-2xl font-black text-brand" aria-hidden="true">
              {i + 1}
            </span>
            <h2 className="font-bold">{title}</h2>
            <p className="col-start-2 leading-relaxed text-muted sm:col-start-3">{body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-10 flex flex-wrap gap-4">
        <Link
          href="/signup"
          className="inline-flex min-h-12 items-center rounded-[2px] border border-ink bg-ink px-6 font-bold text-white transition-colors hover:border-brand-strong hover:bg-brand-strong"
        >
          Sign up to drive
        </Link>
        <Link
          href="/login"
          className="inline-flex min-h-12 items-center rounded-[2px] border border-ink px-6 font-bold transition-colors hover:bg-ink hover:text-white"
        >
          I already have an account
        </Link>
      </div>
    </div>
  );
}
