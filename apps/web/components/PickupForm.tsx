"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { AvailableSlot, SlotWindow } from "@/lib/db/repo";
import { formatSlot, formatSlotDate, formatWindow } from "@/lib/format";
import type { SubmitBody } from "@/lib/pickups/service";
import {
  fieldErrors as toFieldErrors,
  OUT_OF_AREA_MESSAGE,
  pickupFormSchema,
  type FieldErrors,
  type PickupFormInput,
} from "@/lib/validation";
import { Turnstile } from "./Turnstile";

type Field = keyof PickupFormInput;

const FIELD_LABELS: Partial<Record<Field, string>> = {
  name: "Full name",
  email: "Email",
  phone: "Phone",
  address_line: "Street address",
  city: "City",
  zip: "ZIP code",
  book_count: "Approximate number of books",
  slot_id: "Pickup window",
  notes: "Notes",
};

export function PickupForm({
  initialSlots,
  zipAllowlist,
  turnstileSiteKey,
}: {
  initialSlots: AvailableSlot[];
  zipAllowlist: string[];
  turnstileSiteKey: string;
}) {
  const [slots, setSlots] = useState(initialSlots);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Extract<SubmitBody, { ok: true }> | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>();
  const [turnstileReset, setTurnstileReset] = useState(0);
  const summaryRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  const slotsByDate = useMemo(() => {
    const groups = new Map<string, AvailableSlot[]>();
    for (const s of slots) groups.set(s.slot_date, [...(groups.get(s.slot_date) ?? []), s]);
    return [...groups.entries()];
  }, [slots]);

  function showErrors(errs: FieldErrors, message: string) {
    setErrors(errs);
    setFormError(message);
    requestAnimationFrame(() => summaryRef.current?.focus());
  }

  async function refreshSlots() {
    try {
      const res = await fetch("/api/slots/available", { cache: "no-store" });
      if (res.ok) setSlots(((await res.json()) as { slots: AvailableSlot[] }).slots);
    } catch {
      // Keep the current list; the server re-checks availability anyway.
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const raw = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const payload = { ...raw, turnstileToken };

    const parsed = pickupFormSchema.safeParse(payload);
    if (!parsed.success) {
      return showErrors(toFieldErrors(parsed.error), "Please fix the highlighted fields.");
    }
    if (!zipAllowlist.includes(parsed.data.zip)) {
      return showErrors({ zip: OUT_OF_AREA_MESSAGE }, OUT_OF_AREA_MESSAGE);
    }
    if (turnstileSiteKey && !turnstileToken) {
      setErrors({});
      setFormError("Please complete the “I’m human” check below.");
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/pickups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as SubmitBody;
      if (body.ok) {
        setDone(body);
        requestAnimationFrame(() => doneRef.current?.focus());
        return;
      }
      if (res.status === 409) await refreshSlots();
      setTurnstileReset((n) => n + 1);
      showErrors(body.fieldErrors ?? {}, body.error);
    } catch {
      setTurnstileReset((n) => n + 1);
      showErrors({}, "We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) return <Confirmation result={done} headingRef={doneRef} />;

  if (slots.length === 0) {
    return (
      <p role="status">
        No pickup windows are open right now. Please check back soon — we add new dates every week.
      </p>
    );
  }

  const errorEntries = Object.entries(errors) as [Field, string][];

  return (
    <form onSubmit={onSubmit} noValidate aria-describedby="required-note" className="space-y-5">
      <p id="required-note" className="text-sm text-muted">
        All fields are required unless marked optional.
      </p>

      {formError && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-danger bg-danger-soft p-4 text-sm"
        >
          <p className="font-semibold">{formError}</p>
          {errorEntries.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {errorEntries.map(([field, msg]) => (
                <li key={field}>
                  <a href={`#f-${field}`} className="underline">
                    {FIELD_LABELS[field] ?? field}: {msg}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold">Your contact details</legend>
        <TextField name="name" label="Full name" autoComplete="name" error={errors.name} />
        <TextField
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          hint="We'll send your confirmation and cancel link here."
          error={errors.email}
        />
        <TextField
          name="phone"
          label="Phone"
          type="tel"
          autoComplete="tel"
          hint="Only used if the driver can't find your books."
          error={errors.phone}
        />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold">Pickup address</legend>
        <TextField
          name="address_line"
          label="Street address"
          autoComplete="street-address"
          hint="Include apartment or unit number if any."
          error={errors.address_line}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
          <TextField name="city" label="City" autoComplete="address-level2" error={errors.city} />
          <TextField
            name="zip"
            label="ZIP code"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={10}
            error={errors.zip}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold">Your books</legend>
        <TextField
          name="book_count"
          label="Approximate number of books"
          type="number"
          inputMode="numeric"
          min={1}
          max={2000}
          hint="A rough count is fine. A full grocery bag holds about 15–20 textbooks."
          error={errors.book_count}
        />
        <SelectField label="Pickup window" name="slot_id" error={errors.slot_id}>
          <option value="">Choose a date and time…</option>
          {slotsByDate.map(([date, daySlots]) => (
            <optgroup key={date} label={formatSlotDate(date)}>
              {daySlots.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatWindow(s)}
                  {s.remaining !== null && s.remaining <= 5 ? ` (${s.remaining} left)` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectField>
        <TextAreaField
          name="notes"
          label="Notes (optional)"
          hint="Gate code, where you'll leave the books, etc. Max 500 characters."
          error={errors.notes}
        />
      </fieldset>

      {/* Honeypot: hidden from people and screen readers. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor="f-website">Website</label>
        <input id="f-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {turnstileSiteKey && (
        <Turnstile
          siteKey={turnstileSiteKey}
          onToken={setTurnstileToken}
          resetKey={turnstileReset}
        />
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-brand px-4 py-3 text-base font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-60 sm:w-auto"
      >
        {submitting ? "Scheduling…" : "Schedule pickup"}
      </button>
    </form>
  );
}

function Confirmation({
  result,
  headingRef,
}: {
  result: Extract<SubmitBody, { ok: true }>;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <div className="space-y-3" role="status">
      <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold">
        You&apos;re all set — thank you!
      </h2>
      {result.slot && (
        <p>
          We&apos;ll come by on <strong>{formatSlot(result.slot as SlotWindow)}</strong>. Please
          leave your books by the front door before the window starts.
        </p>
      )}
      {result.emailSent ? (
        <p className="text-muted">A confirmation email with a cancel link is on its way.</p>
      ) : (
        <div className="rounded-lg border border-border bg-brand-soft p-4 text-sm">
          <p>
            We couldn&apos;t send your confirmation email. Your pickup is still booked. Save this
            link in case you need to cancel:
          </p>
          {result.cancelUrl && (
            <a href={result.cancelUrl} className="mt-2 inline-block break-all underline">
              Cancel this pickup
            </a>
          )}
        </div>
      )}
    </div>
  );
}

const inputClass =
  "mt-1 block w-full rounded-lg border bg-surface px-3 py-2.5 text-base text-text placeholder:text-muted aria-[invalid=true]:border-danger border-border";

function useFieldIds(name: string, hint?: string, error?: string) {
  const uid = useId();
  const hintId = hint ? `${uid}-hint` : undefined;
  const errorId = error ? `${uid}-error` : undefined;
  return {
    id: `f-${name}`,
    hintId,
    errorId,
    describedBy: [hintId, errorId].filter(Boolean).join(" ") || undefined,
  };
}

function FieldShell({
  id,
  label,
  hint,
  hintId,
  error,
  errorId,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  hintId?: string;
  error?: string;
  errorId?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="mt-0.5 text-sm text-muted">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={errorId} className="mt-1 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function TextField({
  name,
  label,
  hint,
  error,
  ...rest
}: {
  name: Field;
  label: string;
  hint?: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const ids = useFieldIds(name, hint, error);
  return (
    <FieldShell {...ids} label={label} hint={hint} error={error}>
      <input
        id={ids.id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        className={inputClass}
        {...rest}
      />
    </FieldShell>
  );
}

function TextAreaField({
  name,
  label,
  hint,
  error,
}: {
  name: Field;
  label: string;
  hint?: string;
  error?: string;
}) {
  const ids = useFieldIds(name, hint, error);
  return (
    <FieldShell {...ids} label={label} hint={hint} error={error}>
      <textarea
        id={ids.id}
        name={name}
        rows={3}
        maxLength={500}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        className={inputClass}
      />
    </FieldShell>
  );
}

function SelectField({
  name,
  label,
  error,
  children,
}: {
  name: Field;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  const ids = useFieldIds(name, undefined, error);
  return (
    <FieldShell {...ids} label={label} error={error}>
      <select
        id={ids.id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        className={inputClass}
        defaultValue=""
      >
        {children}
      </select>
    </FieldShell>
  );
}
