"use client";

import { useId, useMemo, useRef, useState } from "react";
import { formatHourRange, formatSlot, formatSlotDate, TEXTBOOK_LABEL } from "@/lib/format";
import { TEXTBOOK_TYPES, type AvailableSlot } from "@/lib/shared";
import type { SubmitBody } from "@/lib/pickups/service";
import {
  fieldErrors as toFieldErrors,
  OUT_OF_AREA_MESSAGE,
  pickupFormSchema,
  slotValue,
  type FieldErrors,
  type PickupFormInput,
} from "@/lib/validation";
import { Turnstile } from "./Turnstile";
import { withBase } from "@/lib/base-path";

type Field = keyof PickupFormInput;

const FIELD_LABELS: Partial<Record<Field, string>> = {
  name: "Full name",
  email: "Email",
  phone: "Phone",
  address_line: "Street address",
  city: "City",
  zip: "ZIP code",
  textbook_type: "Type of textbooks",
  book_count: "Approximate number of books",
  slot: "Pickup time",
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
  const [day, setDay] = useState<string | null>(initialSlots[0]?.slot_date ?? null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  const slotsByDate = useMemo(() => {
    const groups = new Map<string, AvailableSlot[]>();
    for (const s of slots) groups.set(s.slot_date, [...(groups.get(s.slot_date) ?? []), s]);
    return [...groups.entries()];
  }, [slots]);
  const daySlots = slotsByDate.find(([d]) => d === day)?.[1] ?? slotsByDate[0]?.[1] ?? [];
  const activeDay = daySlots[0]?.slot_date ?? null;

  function showErrors(errs: FieldErrors, message: string) {
    setErrors(errs);
    setFormError(message);
    requestAnimationFrame(() => summaryRef.current?.focus());
  }

  async function refreshSlots() {
    try {
      const res = await fetch(withBase("/api/slots/available"), { cache: "no-store" });
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
      const res = await fetch(withBase("/api/pickups"), {
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
      <p role="status" className="leading-relaxed">
        There aren&apos;t any open pickup times right now. New times show up when our drivers add
        their weekend hours, so check back in a few days, or{" "}
        <a href={withBase("/contact")} className="font-bold underline underline-offset-4">
          contact us
        </a>
        .
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
          className="border-l-4 border-danger bg-danger-soft p-4 text-sm"
        >
          <p className="font-bold">{formError}</p>
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
        <legend className="mb-1 text-xl font-extrabold tracking-tight">Your contact details</legend>
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
        <legend className="mb-1 text-xl font-extrabold tracking-tight">Pickup address</legend>
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
        <legend className="mb-1 text-xl font-extrabold tracking-tight">Your books</legend>
        <SelectField label="Type of textbooks" name="textbook_type" error={errors.textbook_type}>
          <option value="">Choose one…</option>
          {TEXTBOOK_TYPES.map((t) => (
            <option key={t} value={t}>
              {TEXTBOOK_LABEL[t]}
            </option>
          ))}
        </SelectField>
        <TextField
          name="book_count"
          label="Approximate number of books"
          type="number"
          inputMode="numeric"
          min={1}
          max={2000}
          hint="A rough count is fine. A moving box holds about 20 textbooks."
          error={errors.book_count}
        />
      </fieldset>

      <fieldset
        id="f-slot"
        tabIndex={-1}
        className="space-y-4"
        aria-describedby={errors.slot ? "slot-error" : "slot-hint"}
      >
        <legend className="mb-1 text-xl font-extrabold tracking-tight">Pickup time</legend>
        <p id="slot-hint" className="text-sm text-muted">
          Pickups are on Saturdays and Sundays. Each time is a 1-hour window when a driver is free.
        </p>
        <div role="group" aria-label="Day">
          <p className="mb-2 text-sm font-bold" aria-hidden="true">
            Day
          </p>
          <div className="flex flex-wrap gap-2">
            {slotsByDate.map(([date]) => (
              <label key={date} className={chipClass}>
                <input
                  type="radio"
                  name="slot_day"
                  value={date}
                  checked={activeDay === date}
                  onChange={() => setDay(date)}
                  className="sr-only"
                />
                {formatSlotDate(date, "short")}
              </label>
            ))}
          </div>
        </div>
        {activeDay && (
          <div role="radiogroup" aria-label={`Times on ${formatSlotDate(activeDay)}`}>
            <p className="mb-2 text-sm font-bold" aria-hidden="true">
              Time on {formatSlotDate(activeDay)}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {daySlots.map((s) => (
                <label key={slotValue(s)} className={chipClass}>
                  <input type="radio" name="slot" value={slotValue(s)} className="sr-only" />
                  {formatHourRange(s.hour)}
                </label>
              ))}
            </div>
          </div>
        )}
        {errors.slot && (
          <p id="slot-error" className="text-sm font-bold text-danger">
            {errors.slot}
          </p>
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1 text-xl font-extrabold tracking-tight">Anything else?</legend>
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
        className="min-h-12 w-full rounded-[2px] border border-ink bg-ink px-6 text-[0.9375rem] font-bold text-white transition-colors hover:border-brand-strong hover:bg-brand-strong disabled:opacity-60 sm:w-auto"
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
      <p className="eyebrow">Pickup booked</p>
      <h2 ref={headingRef} tabIndex={-1} className="display text-3xl">
        You&apos;re all set. Thank you!
      </h2>
      {result.slot && (
        <p>
          We&apos;ll come by <strong>{formatSlot(result.slot)}</strong>. Please have your books by
          the front door before then.
        </p>
      )}
      {result.emailSent ? (
        <p className="text-muted">We&apos;ve emailed you a confirmation with a link to cancel.</p>
      ) : (
        <div className="border-l-4 border-brand bg-tint p-4 text-sm">
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
  "mt-1.5 block w-full rounded-[2px] border border-field bg-white px-3 py-2.5 text-base text-ink placeholder:text-muted aria-[invalid=true]:border-2 aria-[invalid=true]:border-danger";

const chipClass =
  "flex min-h-11 cursor-pointer items-center justify-center rounded-[2px] border border-field bg-white px-4 text-sm font-bold text-ink transition-colors hover:border-ink has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand";

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
      <label htmlFor={id} className="block font-bold">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="mt-0.5 text-sm text-muted">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={errorId} className="mt-1.5 text-sm font-bold text-danger">
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
