import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { contactEmail } from "@/lib/contact";
import { getRepo } from "@/lib/db";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Questions about a textbook pickup? Send StemCycle a message.",
};

export default function ContactPage() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16">
      <section aria-labelledby="contact-title">
        <p className="eyebrow">Contact us</p>
        <h1 id="contact-title" className="display mt-2 text-4xl sm:text-5xl">
          Questions? Get in touch.
        </h1>
        <p className="mt-5 max-w-[50ch] text-lg leading-relaxed text-muted">
          Ask about a pickup, our service area, or a large donation. We&apos;ll reply by email.
        </p>
        <Suspense fallback={null}>
          <EmailLine />
        </Suspense>
        <div className="mt-8 border-t border-ink pt-4 text-sm leading-relaxed text-muted">
          <p>
            <strong className="text-ink">Need to cancel a pickup?</strong> Use the cancel link in
            your confirmation email; it works right away.
          </p>
        </div>
      </section>
      <section aria-labelledby="form-title" className="panel p-5 sm:p-8">
        <h2 id="form-title" className="display mb-5 text-2xl">
          Send a message
        </h2>
        <ContactForm turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""} />
      </section>
    </div>
  );
}

async function EmailLine() {
  await connection();
  const email = contactEmail(await (await getRepo()).getPublicSettings());
  if (!email) return null;
  return (
    <p className="mt-6 text-lg">
      Email:{" "}
      <a href={`mailto:${email}`} className="font-bold break-all underline underline-offset-4">
        {email}
      </a>
    </p>
  );
}
