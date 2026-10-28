"use client";

import { useMemo, useState } from "react";
import { Button, Notice } from "@/components/ui";
import { api, errorText } from "@/lib/client/api";
import type { Availability } from "@/lib/db/driver";
import { formatBlocks, formatHourRange, formatInstant, formatSlotDate } from "@/lib/format";

type Hours = Record<string, number[]>; // date -> sorted hours

function weekendOf(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function AvailabilityEditor({ initial }: { initial: Availability }) {
  const toHours = (a: Availability): Hours =>
    Object.fromEntries(a.days.map((d) => [d.date, [...d.hours].sort((x, y) => x - y)]));
  const [saved, setSaved] = useState<Hours>(() => toHours(initial));
  const [hours, setHours] = useState<Hours>(() => toHours(initial));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{
    weekend: string;
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const weekends = useMemo(() => {
    const map = new Map<string, Availability["days"]>();
    for (const d of initial.days) {
      const w = weekendOf(d.date);
      map.set(w, [...(map.get(w) ?? []), d]);
    }
    return [...map.entries()];
  }, [initial.days]);

  const same = (a: number[] = [], b: number[] = []) => a.join() === b.join();

  function toggle(date: string, hour: number) {
    setHours((h) => {
      const cur = h[date] ?? [];
      const next = cur.includes(hour) ? cur.filter((x) => x !== hour) : [...cur, hour];
      return { ...h, [date]: next.sort((x, y) => x - y) };
    });
  }

  async function save(weekend: string, dates: string[], label: string) {
    setBusy(weekend);
    setMsg(null);
    try {
      const res = await api<Availability>("/api/driver/availability", {
        method: "PUT",
        body: { days: dates.map((date) => ({ date, hours: hours[date] ?? [] })) },
      });
      const fresh = toHours(res);
      setSaved(fresh);
      setHours((h) => ({ ...h, ...Object.fromEntries(dates.map((d) => [d, fresh[d] ?? []])) }));
      setMsg({ weekend, kind: "success", text: label });
    } catch (err) {
      setMsg({ weekend, kind: "error", text: errorText(err) });
    } finally {
      setBusy(null);
    }
  }

  /** Copies this weekend's Saturday/Sunday hours to every later weekend, then saves. */
  async function copyForward(weekend: string) {
    const [sat, sun] = [weekend, addDays(weekend, 1)];
    const later = initial.days.filter((d) => weekendOf(d.date) > weekend).map((d) => d.date);
    const next = { ...hours };
    for (const d of later) {
      const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
      next[d] = [...(hours[dow === 6 ? sat : sun] ?? [])];
    }
    setHours(next);
    setBusy(weekend);
    setMsg(null);
    try {
      const dates = [sat, sun, ...later].filter((d) => d in next);
      const res = await api<Availability>("/api/driver/availability", {
        method: "PUT",
        body: { days: dates.map((date) => ({ date, hours: next[date] ?? [] })) },
      });
      setSaved(toHours(res));
      setHours(toHours(res));
      setMsg({ weekend, kind: "success", text: "Saved for every upcoming weekend." });
    } catch (err) {
      setMsg({ weekend, kind: "error", text: errorText(err) });
    } finally {
      setBusy(null);
    }
  }

  if (weekends.length === 0)
    return <Notice>There are no upcoming weekends open for changes right now.</Notice>;

  return (
    <div className="space-y-8">
      {weekends.map(([weekend, days], wi) => {
        const dates = days.map((d) => d.date);
        const dirty = dates.some((d) => !same(hours[d], saved[d]));
        const headingId = `wk-${weekend}`;
        return (
          <section key={weekend} aria-labelledby={headingId} className="border border-line">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line bg-tint px-4 py-3 sm:px-5">
              <h2 id={headingId} className="text-xl font-extrabold tracking-tight">
                Weekend of {formatSlotDate(weekend, "short")}
              </h2>
              <p className="text-sm text-muted">
                Locks {formatInstant(days[0].lock_at, initial.timezone)}
              </p>
            </header>
            <div className="grid gap-6 p-4 sm:p-5 md:grid-cols-2">
              {days.map((d) => {
                const dayName = formatSlotDate(d.date);
                const selected = hours[d.date] ?? [];
                return (
                  <div key={d.date} role="group" aria-label={dayName}>
                    <h3 className="font-bold">{dayName}</h3>
                    <p className="mt-1 min-h-6 text-sm text-muted" aria-live="polite">
                      {selected.length ? formatBlocks(selected) : "Not available"}
                    </p>
                    {d.slots.length === 0 && (
                      <p className="mt-3 text-sm text-muted">No pickups this day.</p>
                    )}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {d.slots.map(({ hour: h, booked, drivers }) => {
                        const on = selected.includes(h);
                        const needsDriver = booked > 0 && drivers === 0;
                        return (
                          <button
                            key={h}
                            type="button"
                            aria-pressed={on}
                            aria-label={`${formatHourRange(h)} on ${dayName}`}
                            aria-describedby={`cover-${d.date}-${h}`}
                            onClick={() => toggle(d.date, h)}
                            className={`flex min-h-14 flex-col items-center justify-center rounded-[2px] border px-2 py-1.5 text-sm font-bold transition-colors ${
                              on
                                ? "border-ink bg-ink text-white"
                                : "border-field bg-white text-ink hover:border-ink"
                            }`}
                          >
                            {formatHourRange(h)}
                            <span
                              id={`cover-${d.date}-${h}`}
                              className={`text-xs font-semibold ${
                                on ? "text-white/80" : needsDriver ? "text-danger" : "text-muted"
                              }`}
                            >
                              {coverText(booked, drivers)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <footer className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 sm:px-5">
              <Button
                variant="primary"
                disabled={!dirty || busy !== null}
                onClick={() => save(weekend, dates, "Saved.")}
              >
                {busy === weekend ? "Saving…" : "Save weekend"}
              </Button>
              {wi === 0 && weekends.length > 1 && (
                <Button disabled={busy !== null} onClick={() => copyForward(weekend)}>
                  Use these hours every weekend
                </Button>
              )}
              {dirty && (
                <span className="text-sm font-bold text-brand-strong">Unsaved changes</span>
              )}
              {msg?.weekend === weekend && (
                <div className="w-full">
                  <Notice kind={msg.kind}>{msg.text}</Notice>
                </div>
              )}
            </footer>
          </section>
        );
      })}
    </div>
  );
}

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "3 booked · needs a driver", counting drivers as saved (not this unsaved tap). */
function coverText(booked: number, drivers: number) {
  const b = `${booked} booked`;
  if (drivers === 0) return booked > 0 ? `${b} · needs a driver` : b;
  return `${b} · ${drivers} ${drivers === 1 ? "driver" : "drivers"}`;
}
