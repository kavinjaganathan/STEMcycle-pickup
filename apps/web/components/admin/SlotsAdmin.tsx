"use client";

import { useMemo, useState } from "react";
import { Button, Card, Field, inputClass, Notice, PageHeader, Spinner } from "@/components/ui";
import { api, errorText } from "@/lib/client/api";
import type { AdminSlot } from "@/lib/db/admin";
import { addDays } from "@/lib/dates";
import { formatSlotDate, formatWindow } from "@/lib/format";
import { useLoad } from "./useLoad";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function SlotsAdmin() {
  const {
    data: slots,
    error,
    setError,
    reload,
  } = useLoad("/api/admin/slots", (b: { slots: AdminSlot[] }) => b.slots);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    from: addDays(today, 1),
    to: addDays(today, 28),
    weekdays: [6] as number[],
    start_time: "09:00",
    end_time: "12:00",
    capacity: "25",
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await api<{ created: number }>("/api/admin/slots", {
        method: "POST",
        body: { ...form, capacity: form.capacity ? Number(form.capacity) : null },
      });
      setMsg(
        res.created === 0
          ? "Those windows already exist."
          : `Added ${res.created} pickup window${res.created === 1 ? "" : "s"}.`,
      );
      await reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function update(s: AdminSlot, patch: Partial<Pick<AdminSlot, "capacity" | "active">>) {
    try {
      await api(`/api/admin/slots/${s.id}`, {
        method: "PATCH",
        body: { capacity: s.capacity, active: s.active, ...patch },
      });
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function remove(s: AdminSlot) {
    try {
      await api(`/api/admin/slots/${s.id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const byDate = useMemo(() => {
    const m = new Map<string, AdminSlot[]>();
    for (const s of slots ?? []) m.set(s.slot_date, [...(m.get(s.slot_date) ?? []), s]);
    return [...m.entries()];
  }, [slots]);

  return (
    <>
      <PageHeader title="Pickup windows" />
      <Card className="mb-6">
        <h2 className="mb-3 font-semibold">Add windows</h2>
        <form onSubmit={create} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="First date">
            {(id) => (
              <input
                id={id}
                type="date"
                required
                value={form.from}
                onChange={(e) => setForm({ ...form, from: e.target.value })}
                className={inputClass}
              />
            )}
          </Field>
          <Field label="Last date">
            {(id) => (
              <input
                id={id}
                type="date"
                required
                value={form.to}
                min={form.from}
                onChange={(e) => setForm({ ...form, to: e.target.value })}
                className={inputClass}
              />
            )}
          </Field>
          <fieldset className="sm:col-span-2 lg:col-span-1">
            <legend className="mb-1 text-sm font-medium">On these days</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d, i) => (
                <label key={d} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--brand)]"
                    checked={form.weekdays.includes(i)}
                    onChange={() =>
                      setForm({
                        ...form,
                        weekdays: form.weekdays.includes(i)
                          ? form.weekdays.filter((x) => x !== i)
                          : [...form.weekdays, i],
                      })
                    }
                  />
                  {d}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Starts">
            {(id) => (
              <input
                id={id}
                type="time"
                required
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                className={inputClass}
              />
            )}
          </Field>
          <Field label="Ends">
            {(id) => (
              <input
                id={id}
                type="time"
                required
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                className={inputClass}
              />
            )}
          </Field>
          <Field label="Max pickups per window" hint="Leave blank for no limit.">
            {(id, d) => (
              <input
                id={id}
                aria-describedby={d}
                type="number"
                min={1}
                max={500}
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                className={inputClass}
              />
            )}
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <Button type="submit" variant="primary" disabled={busy}>
              Add windows
            </Button>
          </div>
        </form>
        {msg && (
          <div className="mt-3">
            <Notice kind="success">{msg}</Notice>
          </div>
        )}
      </Card>

      {error && (
        <div className="mb-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      <h2 className="mb-2 font-semibold">Upcoming windows</h2>
      {slots === null ? (
        <Spinner />
      ) : byDate.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            No upcoming windows. Add some above so residents can book.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {byDate.map(([date, list]) => (
            <Card key={date}>
              <h3 className="mb-2 font-semibold">{formatSlotDate(date)}</h3>
              <ul className="divide-y divide-border">
                {list.map((s) => (
                  <li
                    key={s.id}
                    className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 py-2 sm:flex sm:flex-wrap"
                  >
                    <div className="min-w-0 sm:flex-1">
                      <span className={`font-medium ${s.active ? "" : "text-muted line-through"}`}>
                        {formatWindow(s)}
                      </span>
                      <span className="ml-2 text-sm text-muted">
                        {s.booked} booked{s.capacity !== null ? ` of ${s.capacity}` : ""}
                        {!s.active && " · closed"}
                      </span>
                    </div>
                    <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
                      <label className="flex items-center gap-1.5 text-sm text-muted">
                        Max
                        <span className="sr-only">pickups for {formatWindow(s)}</span>
                        <input
                          type="number"
                          min={1}
                          defaultValue={s.capacity ?? ""}
                          placeholder="—"
                          className="w-20 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text"
                          onBlur={(e) => {
                            const v = e.target.value ? Number(e.target.value) : null;
                            if (v !== s.capacity) void update(s, { capacity: v });
                          }}
                        />
                      </label>
                      <Button size="sm" onClick={() => update(s, { active: !s.active })}>
                        {s.active ? "Close" : "Reopen"}
                      </Button>
                      {s.booked === 0 && (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => remove(s)}
                          aria-label={`Delete ${formatWindow(s)} on ${formatSlotDate(date)}`}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
