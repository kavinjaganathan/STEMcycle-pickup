"use client";

import { useEffect, useRef, useState } from "react";
import { Turnstile } from "@/components/Turnstile";
import { Button, Field, inputClass, Notice } from "@/components/ui";
import { contactSchema } from "@/lib/validation";
import { withBase } from "@/lib/base-path";

type Errors = Record<string, string>;
const LABELS: Record<string, string> = { name: "Name", email: "Email", message: "Message" };

export function ContactForm({ turnstileSiteKey }: { turnstileSiteKey: string }) {
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | undefined>();
  const [reset, setReset] = useState(0);
  const summaryRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (sent) doneRef.current?.focus();
  }, [sent]);
  useEffect(() => {
    if (formError) summaryRef.current?.focus();
  }, [formError, errors]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const payload = { ...Object.fromEntries(new FormData(e.currentTarget)), turnstileToken: token };
    const parsed = contactSchema.safeParse(payload);
    if (!parsed.success) {
      const errs: Errors = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      return setFormError("Please fix the highlighted fields.");
    }
    if (turnstileSiteKey && !token) {
      setErrors({});
      return setFormError("Please complete the “I’m human” check.");
    }
    setBusy(true);
    setFormError(null);
    try {
      const res = await fetch(withBase("/api/contact"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        fieldErrors?: Errors;
      };
      if (res.ok && body.ok) return setSent(true);
      setReset((n) => n + 1);
      setErrors(body.fieldErrors ?? {});
      setFormError(body.error ?? "Something went wrong. Please try again.");
    } catch {
      setFormError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <p ref={doneRef} tabIndex={-1} role="status" className="text-lg leading-relaxed">
        Thanks! Your message was sent. We&apos;ll reply to the email address you gave.
      </p>
    );

  const described = (id: string, name: string, hint?: string) =>
    [hint, errors[name] ? `${id}-err` : undefined].filter(Boolean).join(" ") || undefined;
  const err = (id: string, name: string) =>
    errors[name] && (
      <p id={`${id}-err`} className="mt-1.5 text-sm font-bold text-danger">
        {errors[name]}
      </p>
    );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError && (
        <div ref={summaryRef} tabIndex={-1}>
          <Notice kind="error">
            <p className="font-bold">{formError}</p>
            {Object.keys(errors).length > 0 && (
              <ul className="mt-2 list-disc pl-5">
                {Object.entries(errors).map(([k, v]) => (
                  <li key={k}>
                    {LABELS[k] ?? k}: {v}
                  </li>
                ))}
              </ul>
            )}
          </Notice>
        </div>
      )}
      <Field label="Your name">
        {(id) => (
          <>
            <input
              id={id}
              name="name"
              autoComplete="name"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={described(id, "name")}
              className={inputClass}
            />
            {err(id, "name")}
          </>
        )}
      </Field>
      <Field label="Email" hint="We'll reply here.">
        {(id, hint) => (
          <>
            <input
              id={id}
              name="email"
              type="email"
              autoComplete="email"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={described(id, "email", hint)}
              className={inputClass}
            />
            {err(id, "email")}
          </>
        )}
      </Field>
      <Field label="Message">
        {(id) => (
          <>
            <textarea
              id={id}
              name="message"
              rows={6}
              maxLength={2000}
              aria-invalid={errors.message ? true : undefined}
              aria-describedby={described(id, "message")}
              className={inputClass}
            />
            {err(id, "message")}
          </>
        )}
      </Field>
      {/* Honeypot: hidden from people and screen readers. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor="ct-website">Website</label>
        <input id="ct-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      {turnstileSiteKey && (
        <Turnstile siteKey={turnstileSiteKey} onToken={setToken} resetKey={reset} />
      )}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full sm:w-auto"
        disabled={busy}
      >
        {busy ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
