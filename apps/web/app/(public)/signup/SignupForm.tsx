"use client";

import { useEffect, useRef, useState } from "react";
import { Turnstile } from "@/components/Turnstile";
import { Button, Field, inputClass, Notice } from "@/components/ui";
import { driverSignupSchema } from "@/lib/validation";

type Errors = Record<string, string>;

const LABELS: Record<string, string> = {
  full_name: "Full name",
  email: "Email",
  phone: "Phone",
  capacity_boxes: "Vehicle capacity",
  password: "Password",
};

export function SignupForm({
  invite,
  turnstileSiteKey,
}: {
  invite: string;
  turnstileSiteKey: string;
}) {
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | undefined>();
  const [reset, setReset] = useState(0);
  const summaryRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);

  // Move focus to the confirmation once it has rendered.
  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  function fail(message: string, errs: Errors = {}) {
    setErrors(errs);
    setFormError(message);
    requestAnimationFrame(() => summaryRef.current?.focus());
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload = { ...Object.fromEntries(new FormData(e.currentTarget)), turnstileToken: token };
    const parsed = driverSignupSchema.safeParse(payload);
    if (!parsed.success) {
      const errs: Errors = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      return fail("Please fix the highlighted fields.", errs);
    }
    if (turnstileSiteKey && !token) return fail("Please complete the “I’m human” check.");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        fieldErrors?: Errors;
      };
      if (body.ok) {
        setDone(body.message ?? "Thanks for signing up!");
        return;
      }
      setReset((n) => n + 1);
      fail(body.error ?? "Something went wrong.", body.fieldErrors ?? {});
    } catch {
      fail("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <p ref={doneRef} tabIndex={-1} role="status" className="text-lg leading-relaxed">
        {done}
      </p>
    );

  const input = (name: string, props: React.InputHTMLAttributes<HTMLInputElement>) =>
    function Control(id: string, describedBy?: string) {
      const errId = errors[name] ? `${id}-err` : undefined;
      return (
        <>
          <input
            id={id}
            name={name}
            aria-invalid={errors[name] ? true : undefined}
            aria-describedby={[describedBy, errId].filter(Boolean).join(" ") || undefined}
            className={inputClass}
            {...props}
          />
          {errors[name] && (
            <p id={errId} className="mt-1.5 text-sm font-bold text-danger">
              {errors[name]}
            </p>
          )}
        </>
      );
    };

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
      <Field label="Full name">{input("full_name", { autoComplete: "name" })}</Field>
      <Field label="Email">{input("email", { type: "email", autoComplete: "email" })}</Field>
      <Field label="Phone" hint="The admin may call you about route changes.">
        {input("phone", { type: "tel", autoComplete: "tel" })}
      </Field>
      <Field
        label="Vehicle capacity (boxes)"
        hint="How many moving boxes fit in your vehicle. A mid-size SUV with the seats down holds about 15–20."
      >
        {input("capacity_boxes", { type: "number", inputMode: "numeric", min: 1, max: 200 })}
      </Field>
      <Field label="Password" hint="At least 10 characters.">
        {input("password", { type: "password", autoComplete: "new-password" })}
      </Field>

      <input type="hidden" name="invite" value={invite} />
      {/* Honeypot: hidden from people and screen readers. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor="su-website">Website</label>
        <input id="su-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
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
        {busy ? "Signing up…" : "Sign up"}
      </Button>
    </form>
  );
}
