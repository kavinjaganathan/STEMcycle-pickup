"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MapLine, MapMarker } from "@/components/map/LeafletMap";
import { Button, Card, Notice, PageHeader, Spinner, StatusBadge } from "@/components/ui";
import { api, errorText } from "@/lib/client/api";
import { RouteNavigation } from "@/components/route/RouteNavigation";
import type { AdminWeekend, Depot, PlanRoute, WeekendDay } from "@/lib/db/routing";
import { formatBlocks, formatHourRange, formatSlotDate, formatTime } from "@/lib/format";

const LeafletMap = dynamic(() => import("@/components/map/LeafletMap").then((m) => m.LeafletMap), {
  ssr: false,
  loading: () => <div className="h-80 animate-pulse bg-tint" />,
});

/** Saturdays from two weeks ago to `ahead` weeks out (browser-local dates). */
function saturdays(ahead: number) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7) - 14);
  const out: string[] = [];
  for (let i = 0; i < ahead + 3; i++) {
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
    d.setDate(d.getDate() + 7);
  }
  return out;
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function RoutesAdmin({ initialWeekend }: { initialWeekend?: string }) {
  const options = useMemo(() => saturdays(6), []);
  const [weekend, setWeekend] = useState(initialWeekend ?? options[2]);
  const [data, setData] = useState<AdminWeekend | null>(null);
  const [day, setDay] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<AdminWeekend>(`/api/admin/routing/${weekend}`));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [weekend]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // While changes are waiting to be planned, refresh so the admin sees the result.
  useEffect(() => {
    if (!data || (!data.dirty_at && !data.running) || data.locked_at) return;
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
  }, [data, load]);

  async function runNow() {
    setRunning(true);
    setNotice(null);
    setError(null);
    try {
      await api(`/api/admin/routing/${weekend}/run`, { method: "POST" });
      setNotice("Routes re-planned.");
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setRunning(false);
    }
  }

  async function assign(pickupId: string, driverId: string | null) {
    setRunning(true);
    setNotice(null);
    setError(null);
    try {
      const res = await api<{ replanned: boolean }>(`/api/admin/pickups/${pickupId}/assign`, {
        method: "POST",
        body: { driver_id: driverId },
      });
      setNotice(
        res.replanned
          ? "Assignment saved and routes re-planned."
          : "Assignment saved. Routes will re-plan in a couple of minutes.",
      );
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setRunning(false);
    }
  }

  const current = data?.days[day];

  return (
    <>
      <PageHeader eyebrow="Admin" title="Routes">
        <Button variant="primary" onClick={runNow} disabled={running || !data}>
          {running ? "Planning…" : "Re-run routing now"}
        </Button>
      </PageHeader>

      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="weekend" className="mb-1.5 block text-sm font-bold">
            Weekend
          </label>
          <select
            id="weekend"
            value={weekend}
            onChange={(e) => {
              if (e.target.value === weekend) return;
              setWeekend(e.target.value);
              setData(null);
              setDay(0);
            }}
            className="block rounded-[2px] border border-field bg-white px-3 py-2.5"
          >
            {options.map((s) => (
              <option key={s} value={s}>
                {formatSlotDate(s, "short")} – {formatSlotDate(addDays(s, 1), "short")}
              </option>
            ))}
          </select>
        </div>
        {data && <RunStatus w={data} />}
      </div>

      {error && (
        <div className="mb-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {notice && (
        <div className="mb-4">
          <Notice kind="success">{notice}</Notice>
        </div>
      )}

      {!data || !current ? (
        <Spinner />
      ) : (
        <>
          <div role="tablist" aria-label="Day" className="mb-4 flex gap-2">
            {data.days.map((d, i) => (
              <button
                key={d.date}
                role="tab"
                id={`tab-${i}`}
                aria-selected={i === day}
                aria-controls="day-panel"
                onClick={() => setDay(i)}
                className={`min-h-10 rounded-[2px] border px-4 text-sm font-bold ${
                  i === day
                    ? "border-ink bg-ink text-white"
                    : "border-field bg-white hover:border-ink"
                }`}
              >
                {formatSlotDate(d.date, "short")}
                <span className="ml-2 font-semibold opacity-80">
                  {(d.plan?.routes.reduce((n, r) => n + r.stops.length, 0) ?? 0) +
                    d.unassigned.length}
                </span>
              </button>
            ))}
          </div>
          <div id="day-panel" role="tabpanel" aria-labelledby={`tab-${day}`}>
            <DayView day={current} busy={running} onAssign={assign} />
          </div>
        </>
      )}
    </>
  );
}

function RunStatus({ w }: { w: AdminWeekend }) {
  let text: string;
  if (w.locked_at) text = `Routes are final (locked ${when(w.locked_at)}). Drivers were emailed.`;
  else if (w.running) text = "Planning routes now…";
  else if (w.dirty_at) text = "Changes waiting: routes re-plan within a couple of minutes.";
  else if (w.last_run_at) text = `Routes are up to date (planned ${when(w.last_run_at)}).`;
  else text = "Nothing to plan yet.";
  return (
    <div className="text-sm" role="status">
      <p className="font-bold">{text}</p>
      {!w.locked_at && <p className="text-muted">Locks and emails drivers {when(w.lock_at)}.</p>}
      {w.last_run_status === "failed" && (
        <p className="font-bold text-danger">The last run failed; it will retry automatically.</p>
      )}
    </div>
  );
}

function DayView({
  day,
  busy,
  onAssign,
}: {
  day: WeekendDay;
  busy: boolean;
  onAssign: (pickupId: string, driverId: string | null) => void;
}) {
  const plan = day.plan;
  const routes = useMemo(() => plan?.routes ?? [], [plan]);
  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = [];
    if (plan?.depot)
      m.push({
        id: "depot",
        lat: plan.depot.lat,
        lng: plan.depot.lng,
        title: `Depot: ${plan.depot.name}`,
        label: "D",
        color: "#111111",
        shape: "square",
      });
    for (const r of routes)
      for (const s of r.stops)
        m.push({
          id: s.id,
          lat: s.lat,
          lng: s.lng,
          title: `${r.driver_name} stop ${s.seq}: ${s.name}`,
          label: String(s.seq),
          color: r.color,
        });
    return m;
  }, [plan, routes]);
  const lines = useMemo<MapLine[]>(
    () => routes.map((r) => ({ id: r.id, points: r.geometry, color: r.color })),
    [routes],
  );
  const idle = day.drivers.filter((d) => !routes.some((r) => r.driver_id === d.id));

  return (
    <div className="space-y-6">
      {plan && plan.solver !== "none" && (
        <p className="text-sm text-muted">
          {plan.solver === "ortools"
            ? "Optimized with OR-Tools"
            : "Planned with the built-in fallback (the optimizer was unavailable)"}{" "}
          {plan.matrix_provider === "fake"
            ? "with made-up travel times (local test mode)."
            : `with ${plan.matrix_provider === "ors" ? "OpenRouteService" : "OSRM"} road travel times.`}
        </p>
      )}
      {markers.length > 0 && (
        <LeafletMap
          label="Route map"
          className="h-80 border border-line sm:h-96"
          markers={markers}
          lines={lines}
          fitKey={plan?.id}
        />
      )}

      {day.unassigned.length > 0 && (
        <section
          aria-labelledby="unassigned-title"
          className="border-l-4 border-danger bg-danger-soft p-4"
        >
          <h2 id="unassigned-title" className="text-xl font-extrabold tracking-tight">
            Unassigned <span className="text-danger">{day.unassigned.length}</span>
          </h2>
          <ul className="mt-3 space-y-3">
            {day.unassigned.map((u) => (
              <li key={u.pickup_id} className="bg-white p-3">
                <p className="font-bold">
                  {formatHourRange(u.slot_hour)} · {u.name}
                </p>
                <p className="text-sm">
                  {u.address_line}, {u.city} · ~{u.est_boxes} {u.est_boxes === 1 ? "box" : "boxes"}
                </p>
                <p className="mt-1 text-sm font-bold text-danger">
                  {u.reason ?? "Not routed yet."}
                </p>
                <AssignSelect
                  slotHour={u.slot_hour}
                  pickupId={u.pickup_id}
                  label={`Assign ${u.name} to`}
                  value={u.pinned_driver_id}
                  drivers={day.drivers}
                  busy={busy}
                  onAssign={onAssign}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {routes.length === 0 && day.unassigned.length === 0 && (
        <Card>
          <p className="text-sm text-muted">No pickups on this day.</p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {routes.map((r) => (
          <RouteCard
            key={r.id}
            r={r}
            depot={plan?.depot ?? null}
            day={day}
            busy={busy}
            onAssign={onAssign}
          />
        ))}
      </div>

      {idle.length > 0 && (
        <section aria-labelledby="idle-title">
          <h2 id="idle-title" className="mb-2 font-bold">
            Available with no stops
          </h2>
          <ul className="text-sm text-muted">
            {idle.map((d) => (
              <li key={d.id}>
                {d.full_name}: {formatBlocks(d.hours)} · {d.capacity_boxes} boxes
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function RouteCard({
  r,
  depot,
  day,
  busy,
  onAssign,
}: {
  r: PlanRoute;
  depot: Depot | null;
  day: WeekendDay;
  busy: boolean;
  onAssign: (pickupId: string, driverId: string | null) => void;
}) {
  const capacity = day.drivers.find((d) => d.id === r.driver_id)?.capacity_boxes;
  return (
    <article aria-label={`Route for ${r.driver_name}`} className="border border-line bg-white">
      <header
        className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3"
        style={{ boxShadow: `inset 4px 0 0 ${r.color}` }}
      >
        <h3 className="text-lg font-extrabold tracking-tight">{r.driver_name}</h3>
        <p className="text-sm text-muted">
          {formatTime(r.start_at)} – {formatTime(r.end_at)} · {Math.round(r.total_seconds / 60)} min
          {r.total_meters !== null && ` · ${(r.total_meters / 1609.34).toFixed(1)} mi`} ·{" "}
          {r.total_boxes}
          {capacity ? `/${capacity}` : ""} boxes
        </p>
      </header>
      <div className="border-b border-line px-4 py-3">
        <RouteNavigation depot={depot} stops={r.stops} />
      </div>
      <ol className="divide-y divide-line">
        {r.stops.map((s) => (
          <li key={s.id} className="grid grid-cols-[2rem_1fr] gap-x-3 px-4 py-3">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: r.color }}
              aria-hidden="true"
            >
              {s.seq}
            </span>
            <div className="min-w-0">
              <p className="font-bold">
                <span className="sr-only">Stop {s.seq}: </span>
                {formatTime(s.eta)} · {s.name}
                {s.pinned && <span className="ml-2 text-xs font-bold text-brand">Assigned</span>}
              </p>
              <p className="text-sm">
                {s.address_line}, {s.city}
              </p>
              <p className="text-sm text-muted">
                Slot {formatHourRange(s.slot_hour)} · ~{s.est_boxes}{" "}
                {s.est_boxes === 1 ? "box" : "boxes"}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                {s.status !== "scheduled" && <StatusBadge status={s.status} />}
                <AssignSelect
                  slotHour={s.slot_hour}
                  pickupId={s.pickup_id}
                  label={`Assign ${s.name} to`}
                  value={s.pinned ? r.driver_id : null}
                  drivers={day.drivers}
                  busy={busy}
                  onAssign={onAssign}
                />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}

function AssignSelect({
  slotHour,
  pickupId,
  label,
  value,
  drivers,
  busy,
  onAssign,
}: {
  slotHour: number;
  pickupId: string;
  label: string;
  value: string | null;
  drivers: WeekendDay["drivers"];
  busy: boolean;
  onAssign: (pickupId: string, driverId: string | null) => void;
}) {
  const id = `assign-${pickupId}`;
  return (
    <div className="mt-2 flex items-center gap-2 text-sm">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <span aria-hidden="true" className="text-muted">
        Driver:
      </span>
      <select
        id={id}
        value={value ?? ""}
        disabled={busy}
        onChange={(e) => onAssign(pickupId, e.target.value || null)}
        className="rounded-[2px] border border-field bg-white px-2 py-1.5"
      >
        <option value="">Automatic</option>
        {/* Only drivers free during this pickup's hour (plus the current choice). */}
        {drivers
          .filter((d) => d.hours.includes(slotHour) || d.id === value)
          .map((d) => (
            <option key={d.id} value={d.id}>
              {d.full_name} ({formatBlocks(d.hours)})
            </option>
          ))}
      </select>
    </div>
  );
}

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
