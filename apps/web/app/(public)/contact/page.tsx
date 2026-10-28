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
          Get in touch
        </h1>
        <p className="mt-5 max-w-[50ch] text-lg leading-relaxed text-muted">
          Questions about a pickup, where we go, or a large donation? Send us a message and
          we&apos;ll email you back.
        </p>
        <dl className="mt-6 space-y-2 text-lg">
          <Suspense fallback={null}>
            <EmailLine />
          </Suspense>
          <div>
            <dt className="inline">Website: </dt>
            <dd className="inline">
              <a href="https://ftcoverdrive.org" className="font-bold underline underline-offset-4">
                ftcoverdrive.org
              </a>
            </dd>
          </div>
        </dl>
        <div className="mt-8 border-t border-ink pt-4 text-sm leading-relaxed text-muted">
          <p>
            <strong className="text-ink">Need to cancel?</strong> Use the link in your confirmation
            email. You don&apos;t need to message us.
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
    <div>
      <dt className="inline">Email: </dt>
      <dd className="inline">
        <a href={`mailto:${email}`} className="font-bold break-all underline underline-offset-4">
          {email}
        </a>
      </dd>
    </div>
  );
}
