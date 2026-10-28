"use client";

import { useState } from "react";
import { Button, Card, Field, inputClass, Notice, PageHeader, Spinner } from "@/components/ui";
import { api, errorText } from "@/lib/client/api";
import { formatHour, formatHourRange } from "@/lib/format";
import type { OrgSettings } from "@/lib/db/admin";
import { useLoad } from "./useLoad";

type NumKey = {
  [K in keyof OrgSettings]: OrgSettings[K] extends number ? K : never;
}[keyof OrgSettings];

const SECTIONS: { title: string; intro?: string; fields: [NumKey, string, string?][] }[] = [
  {
    title: "Bookings and availability",
    fields: [
      ["booking_weekends", "Weekends open for booking"],
      [
        "slot_limit",
        "Bookings per pickup time",
        "A time stops showing on the form once it has this many bookings.",
      ],
      ["retention_days", "Delete personal details after (days)", "Counted from the pickup date."],
    ],
  },
  {
    title: "Routing",
    intro: "Routes re-plan automatically a couple of minutes after anything changes.",
    fields: [
      ["books_per_box", "Books per box", "Used to estimate boxes from the resident's book count."],
      ["service_min_base", "Minutes per stop"],
      ["service_min_per_50_books", "Extra minutes per 50 books"],
      ["max_route_min", "Max route length (minutes)"],
      [
        "return_buffer_min",
        "Drive back after the last hour (minutes)",
        "How long after their last available hour a driver may still be returning to the depot.",
      ],
    ],
  },
];

export function SettingsAdmin() {
  const { data, error, setError } = useLoad("/api/admin/settings", (b: OrgSettings) => b);
  if (error && !data) return <Notice kind="error">{error}</Notice>;
  if (!data) return <Spinner />;
  return <SettingsForm initial={data} onError={setError} error={error} />;
}

function SettingsForm({
  initial,
  error,
  onError,
}: {
  initial: OrgSettings;
  error: string | null;
  onError: (e: string | null) => void;
}) {
  const [s, setS] = useState({
    ...initial,
    lock_time: initial.lock_time.slice(0, 5),
    reply_to: initial.reply_to ?? "",
  });
  const [zips, setZips] = useState(initial.zip_allowlist.join(", "));
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    onError(null);
    try {
      const zip_allowlist = [...new Set(zips.split(/[\s,]+/).filter(Boolean))];
      await api("/api/admin/settings", { method: "PUT", body: { ...s, zip_allowlist } });
      setSaved(true);
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function locateDepot() {
    setLocating(true);
    onError(null);
    try {
      const r = await api<{ lat: number; lng: number }>("/api/admin/geocode", {
        method: "POST",
        body: { address: s.depot_address },
      });
      setS({ ...s, depot_lat: r.lat, depot_lng: r.lng });
    } catch (err) {
      onError(errorText(err));
    } finally {
      setLocating(false);
    }
  }

  function textInput(
    k: "org_name" | "timezone" | "email_display_name" | "depot_name",
    id: string,
    d?: string,
  ) {
    return (
      <input
        id={id}
        aria-describedby={d}
        required
        value={s[k]}
        onChange={(e) => setS({ ...s, [k]: e.target.value })}
        className={inputClass}
      />
    );
  }
  function coordInput(k: "depot_lat" | "depot_lng", id: string) {
    return (
      <input
        id={id}
        inputMode="decimal"
        value={s[k] ?? ""}
        onChange={(e) =>
          setS({ ...s, [k]: e.target.value.trim() === "" ? null : Number(e.target.value) })
        }
        className={inputClass}
      />
    );
  }

  return (
    <>
      <PageHeader eyebrow="Admin" title="Settings" />
      <form onSubmit={save} className="max-w-4xl space-y-6">
        {error && <Notice kind="error">{error}</Notice>}
        {saved && <Notice kind="success">Settings saved. Upcoming routes will re-plan.</Notice>}

        <Card>
          <h2 className="mb-1 text-xl font-extrabold tracking-tight">Depot</h2>
          <p className="mb-4 text-sm text-muted">Every route starts and ends here.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Depot name">{(id, d) => textInput("depot_name", id, d)}</Field>
            <Field label="Depot address">
              {(id) => (
                <input
                  id={id}
                  value={s.depot_address}
                  onChange={(e) =>
                    setS({ ...s, depot_address: e.target.value, depot_lat: null, depot_lng: null })
                  }
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="Latitude">{(id) => coordInput("depot_lat", id)}</Field>
            <Field label="Longitude">{(id) => coordInput("depot_lng", id)}</Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={locateDepot} disabled={locating || s.depot_address.trim().length < 5}>
              {locating ? "Finding…" : "Find coordinates"}
            </Button>
            {s.depot_lat === null && (
              <span className="text-sm font-bold text-danger">
                No coordinates yet: routes can&apos;t be planned.
              </span>
            )}
          </div>
        </Card>

        {SECTIONS.map((sec) => (
          <Card key={sec.title}>
            <h2 className="mb-1 text-xl font-extrabold tracking-tight">{sec.title}</h2>
            {sec.intro && <p className="mb-4 text-sm text-muted">{sec.intro}</p>}
            {sec.title === "Bookings and availability" && (
              <PickupTimes
                sat={s.sat_hours}
                sun={s.sun_hours}
                onChange={(sat_hours, sun_hours) => setS({ ...s, sat_hours, sun_hours })}
              />
            )}
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {sec.fields.map(([k, label, hint]) => (
                <Field key={k} label={label} hint={hint}>
                  {(id, d) => (
                    <input
                      id={id}
                      aria-describedby={d}
                      type="number"
                      inputMode="numeric"
                      value={s[k]}
                      onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })}
                      className={inputClass}
                    />
                  )}
                </Field>
              ))}
              {sec.title === "Bookings and availability" && (
                <Field
                  label="Weekend lock time (Friday)"
                  hint="Bookings and availability close and routes become final."
                >
                  {(id, d) => (
                    <input
                      id={id}
                      aria-describedby={d}
                      type="time"
                      value={s.lock_time}
                      onChange={(e) => setS({ ...s, lock_time: e.target.value })}
                      className={inputClass}
                    />
                  )}
                </Field>
              )}
            </div>
            {sec.title === "Bookings and availability" && (
              <div className="mt-4">
                <Field label="Service-area ZIP codes" hint="Separate with commas or spaces.">
                  {(id, d) => (
                    <textarea
                      id={id}
                      aria-describedby={d}
                      rows={3}
                      value={zips}
                      onChange={(e) => setZips(e.target.value)}
                      className={inputClass}
                    />
                  )}
                </Field>
              </div>
            )}
          </Card>
        ))}

        <Card>
          <h2 className="mb-4 text-xl font-extrabold tracking-tight">Organization and email</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Organization name">{(id, d) => textInput("org_name", id, d)}</Field>
            <Field label="Timezone" hint="IANA name, e.g. America/Chicago.">
              {(id, d) => textInput("timezone", id, d)}
            </Field>
            <Field label="Email sender name">
              {(id, d) => textInput("email_display_name", id, d)}
            </Field>
            <Field
              label="Reply-to address (optional)"
              hint="The sending address itself is EMAIL_FROM in the hosting settings."
            >
              {(id, d) => (
                <input
                  id={id}
                  aria-describedby={d}
                  type="email"
                  value={s.reply_to}
                  onChange={(e) => setS({ ...s, reply_to: e.target.value })}
                  className={inputClass}
                />
              )}
            </Field>
          </div>
        </Card>
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </Button>
      </form>
    </>
  );
}

const HOUR_CHOICES = Array.from({ length: 13 }, (_, i) => 7 + i); // 7 AM to 7 PM starts

/**
 * The fixed 1-hour pickup times residents can book. Drivers choose from these
 * same times, so keep the list short and close together.
 */
function PickupTimes({
  sat,
  sun,
  onChange,
}: {
  sat: number[];
  sun: number[];
  onChange: (sat: number[], sun: number[]) => void;
}) {
  const toggle = (list: number[], h: number) =>
    (list.includes(h) ? list.filter((x) => x !== h) : [...list, h]).sort((a, b) => a - b);
  const days = [
    { name: "Saturday", hours: sat, set: (h: number) => onChange(toggle(sat, h), sun) },
    { name: "Sunday", hours: sun, set: (h: number) => onChange(sat, toggle(sun, h)) },
  ];
  return (
    <div className="mt-3 space-y-4">
      <div>
        <h3 className="font-bold">Pickup times</h3>
        <p className="text-sm text-muted">
          Residents can book these whether or not a driver has signed up yet. Drivers then pick
          which ones they can cover.
        </p>
      </div>
      {days.map((d) => (
        <div key={d.name} role="group" aria-label={`${d.name} pickup times`}>
          <p className="mb-2 text-sm font-bold">
            {d.name}
            <span className="ml-2 font-normal text-muted">
              {d.hours.length ? d.hours.map((h) => formatHourRange(h)).join(", ") : "No pickups"}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {HOUR_CHOICES.map((h) => {
              const on = d.hours.includes(h);
              return (
                <button
                  key={h}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${formatHourRange(h)} on ${d.name}`}
                  onClick={() => d.set(h)}
                  className={`min-h-11 min-w-16 rounded-[2px] border px-2 text-sm font-bold transition-colors ${
                    on
                      ? "border-ink bg-ink text-white"
                      : "border-field bg-white text-ink hover:border-ink"
                  }`}
                >
                  {formatHour(h)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
