"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapMarker } from "@/components/map/LeafletMap";
import { Button, Notice, Spinner } from "@/components/ui";
import { api, ApiError, errorText } from "@/lib/client/api";
import { addDays } from "@/lib/dates";
import type { Depot } from "@/lib/db/routing";
import type { DriverRoute, DriverStop, DriverWeekend } from "@/lib/db/driver";
import {
  formatBlocks,
  formatHourRange,
  formatInstant,
  formatSlotDate,
  formatTime,
  TEXTBOOK_LABEL,
} from "@/lib/format";
import { formatPhone } from "@/lib/validation";
import { RouteNavigation } from "@/components/route/RouteNavigation";
import { appleMapsUrl, googleMapsUrl } from "@/lib/maps";

const LeafletMap = dynamic(() => import("@/components/map/LeafletMap").then((m) => m.LeafletMap), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse bg-tint" />,
});

// Taps made without signal are queued here (stop ids only, never personal details).
const QUEUE_KEY = "stemcycle-driver-queue";
type Queued = { stopId: string; pickedUp: boolean };

function readQueue(): Queued[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as Queued[];
  } catch {
    return [];
  }
}
function writeQueue(q: Queued[]) {
  try {
    if (q.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    else localStorage.removeItem(QUEUE_KEY);
  } catch {
    // Storage unavailable (private mode): the tap stays applied on screen only.
  }
}

export function DriverRoutes({
  initialWeekend,
  today,
  timezone,
}: {
  initialWeekend: string;
  today: string;
  timezone: string;
}) {
  const [weekend, setWeekend] = useState(initialWeekend);
  const [data, setData] = useState<DriverWeekend | null>(null);
  const [day, setDay] = useState(() => (today === addDays(initialWeekend, 1) ? 1 : 0));
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(0);
  const [busyStop, setBusyStop] = useState<string | null>(null);
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const flushQueue = useCallback(async () => {
    const q = readQueue();
    if (!q.length) return setQueued(0);
    const left: Queued[] = [];
    for (const item of q) {
      try {
        await api(`/api/driver/stops/${item.stopId}`, {
          method: "POST",
          body: { picked_up: item.pickedUp },
        });
      } catch (err) {
        // Keep only network failures; server rejections (e.g. resident cancelled) are dropped.
        if (err instanceof ApiError && err.status === 0) left.push(item);
      }
    }
    writeQueue(left);
    setQueued(left.length);
  }, []);

  const load = useCallback(async () => {
    try {
      await flushQueue();
      const res = await api<DriverWeekend>(`/api/driver/routes?weekend=${weekend}`);
      // Re-apply anything still queued so the screen matches what the driver tapped.
      const pending = new Map(readQueue().map((q) => [q.stopId, q.pickedUp]));
      setData({
        ...res,
        days: res.days.map((d) => ({
          ...d,
          routes: d.routes.map((r) => ({
            ...r,
            stops: r.stops.map((s) =>
              pending.has(s.id)
                ? { ...s, status: pending.get(s.id) ? "picked_up" : "scheduled" }
                : s,
            ),
          })),
        })),
      });
      setError(null);
    } catch (err) {
      // Keep showing the last route we had: a lost signal shouldn't blank the page.
      setError(dataRef.current ? "No connection. Showing your last loaded route." : errorText(err));
    }
  }, [weekend, flushQueue]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), 60_000);
    const online = () => void load();
    window.addEventListener("online", online);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", online);
    };
  }, [load]);

  function updateLocal(stopId: string, status: DriverStop["status"]) {
    setData(
      (w) =>
        w && {
          ...w,
          days: w.days.map((d) => ({
            ...d,
            routes: d.routes.map((r) => ({
              ...r,
              stops: r.stops.map((s) => (s.id === stopId ? { ...s, status } : s)),
            })),
          })),
        },
    );
  }

  async function mark(stop: DriverStop, pickedUp: boolean) {
    setBusyStop(stop.id);
    updateLocal(stop.id, pickedUp ? "picked_up" : "scheduled");
    try {
      await api(`/api/driver/stops/${stop.id}`, { method: "POST", body: { picked_up: pickedUp } });
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        const q = readQueue().filter((x) => x.stopId !== stop.id);
        writeQueue([...q, { stopId: stop.id, pickedUp }]);
        setQueued(q.length + 1);
      } else {
        updateLocal(stop.id, stop.status);
        setError(errorText(err));
      }
    } finally {
      setBusyStop(null);
    }
  }

  function go(delta: number) {
    setData(null);
    setDay(0);
    setWeekend(addDays(weekend, delta * 7));
  }

  const current = data?.days[day];

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button size="sm" onClick={() => go(-1)}>
          <span aria-hidden="true">‹</span> Prev<span className="sr-only">ious weekend</span>
        </Button>
        <h1 className="text-center">
          <span className="eyebrow block">My route</span>
          <span className="display block text-2xl">
            Weekend of {formatSlotDate(weekend, "short")}
          </span>
        </h1>
        <Button size="sm" onClick={() => go(1)}>
          Next<span className="sr-only"> weekend</span> <span aria-hidden="true">›</span>
        </Button>
      </div>

      {queued > 0 && (
        <div className="mb-3">
          <Notice>
            {queued} update{queued === 1 ? "" : "s"} saved on this phone. They&apos;ll sync when
            you&apos;re back online.
          </Notice>
        </div>
      )}
      {error && (
        <div className="mb-3">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {!data || !current ? (
        <Spinner label="Loading your route…" />
      ) : (
        <>
          {!data.locked && new Date(data.lock_at) > new Date() && (
            <p className="mb-4 border-l-4 border-brand bg-tint p-3 text-sm">
              <strong>Tentative.</strong> Routes can still change as residents book. They become
              final {formatInstant(data.lock_at, timezone)}, and we&apos;ll email you.
            </p>
          )}
          <div role="tablist" aria-label="Day" className="mb-4 grid grid-cols-2 gap-2">
            {data.days.map((d, i) => {
              const n = d.routes.reduce((sum, r) => sum + r.stops.length, 0);
              return (
                <button
                  key={d.date}
                  role="tab"
                  id={`dtab-${i}`}
                  aria-selected={i === day}
                  aria-controls="driver-day"
                  onClick={() => setDay(i)}
                  className={`min-h-11 rounded-[2px] border text-sm font-bold ${
                    i === day ? "border-ink bg-ink text-white" : "border-field bg-white"
                  }`}
                >
                  {formatSlotDate(d.date, "short")} · {n} {n === 1 ? "stop" : "stops"}
                </button>
              );
            })}
          </div>
          <div id="driver-day" role="tabpanel" aria-labelledby={`dtab-${day}`}>
            {current.routes.length === 0 ? (
              <p className="border border-line p-4 text-center text-muted">
                {current.hours.length
                  ? `You're available ${formatBlocks(current.hours)}, but no pickups are assigned to you yet.`
                  : "You have no hours or stops on this day."}
              </p>
            ) : (
              current.routes.map((r) => (
                <RouteView
                  key={r.id}
                  route={r}
                  depot={current.depot}
                  busyStop={busyStop}
                  onMark={mark}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function RouteView({
  route,
  depot,
  busyStop,
  onMark,
}: {
  route: DriverRoute;
  depot: Depot | null;
  busyStop: string | null;
  onMark: (s: DriverStop, picked: boolean) => void;
}) {
  const [showMap, setShowMap] = useState(false);
  const active = route.stops.filter((s) => s.status !== "cancelled");
  const done = active.filter((s) => s.status === "picked_up").length;
  const remaining = active.filter((s) => s.status !== "picked_up");
  const next = remaining[0];

  const markers = useMemo<MapMarker[]>(
    () => [
      ...(depot
        ? [
            {
              id: "depot",
              lat: depot.lat,
              lng: depot.lng,
              title: `Depot: ${depot.name}`,
              label: "D",
              color: "#111111",
              shape: "square" as const,
            },
          ]
        : []),
      ...route.stops.map((s) => ({
        id: s.id,
        lat: s.lat,
        lng: s.lng,
        title: `Stop ${s.seq}: ${s.address_line}`,
        label: String(s.seq),
        color: s.status === "picked_up" ? "#6b7280" : "#8f3ba5",
      })),
    ],
    [route, depot],
  );

  return (
    <section aria-labelledby={`route-${route.id}`} className="mb-8">
      <div className="panel mb-4 p-4">
        <h2 id={`route-${route.id}`} className="text-xl font-extrabold tracking-tight">
          {formatTime(route.start_at)} – {formatTime(route.end_at)}
        </h2>
        <p className="text-sm text-muted">
          Leave {depot?.name ?? "the depot"} at {formatTime(route.start_at)} · about{" "}
          {route.total_boxes} {route.total_boxes === 1 ? "box" : "boxes"} · back by{" "}
          {formatTime(route.end_at)}
        </p>
        {depot && <p className="text-sm text-muted">{depot.address}</p>}
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-sm">
            <span className="font-bold">
              {done} of {active.length} picked up
            </span>
            <span className="text-muted">{remaining.length} to go</span>
          </div>
          <div
            className="h-2 overflow-hidden bg-lav"
            role="progressbar"
            aria-label="Route progress"
            aria-valuemin={0}
            aria-valuemax={active.length}
            aria-valuenow={done}
          >
            <div
              className="h-full bg-brand"
              style={{ width: `${active.length ? (done / active.length) * 100 : 0}%` }}
            />
          </div>
        </div>
        <div className="mt-4">
          <RouteNavigation depot={depot} stops={route.stops} showRemaining />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => setShowMap((v) => !v)} aria-expanded={showMap}>
            {showMap ? "Hide map" : "Show map"}
          </Button>
        </div>
        {showMap && (
          <div className="mt-3">
            <LeafletMap
              label="Route map"
              className="h-64"
              markers={markers}
              lines={
                route.geometry.length
                  ? [{ id: route.id, points: route.geometry, color: "#8f3ba5" }]
                  : []
              }
              fitKey={route.id}
            />
          </div>
        )}
      </div>

      <ol className="space-y-3">
        {route.stops.map((s) => (
          <li key={s.id}>
            <StopCard
              stop={s}
              isNext={s.id === next?.id}
              busy={busyStop === s.id}
              onMark={onMark}
            />
          </li>
        ))}
      </ol>
      {depot && remaining.length === 0 && active.length > 0 && (
        <p className="mt-4 border-l-4 border-success bg-success-soft p-4 font-bold">
          All done. Head back to {depot.name}. Thank you!
        </p>
      )}
    </section>
  );
}

function StopCard({
  stop,
  isNext,
  busy,
  onMark,
}: {
  stop: DriverStop;
  isNext: boolean;
  busy: boolean;
  onMark: (s: DriverStop, picked: boolean) => void;
}) {
  const picked = stop.status === "picked_up";
  const cancelled = stop.status === "cancelled";
  const maps =
    "flex min-h-12 items-center justify-center rounded-[2px] border border-ink px-3 text-center text-sm font-bold hover:bg-ink hover:text-white";
  return (
    <article
      aria-label={`Stop ${stop.seq}: ${stop.address_line}`}
      className={`border bg-white p-4 ${isNext ? "border-2 border-brand" : "border-line"} ${picked || cancelled ? "opacity-75" : ""}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${picked ? "bg-zinc-500" : "bg-brand"}`}
          aria-hidden="true"
        >
          {picked ? "✓" : stop.seq}
        </span>
        <div className="min-w-0 flex-1">
          {isNext && <p className="eyebrow">Next stop</p>}
          <p className="text-lg leading-snug font-bold">{stop.address_line}</p>
          <p className="text-muted">
            {stop.city} {stop.zip}
          </p>
          <p className="mt-1 text-sm">
            ETA <strong>{formatTime(stop.eta)}</strong> · slot {formatHourRange(stop.slot_hour)}
          </p>
          <p className="text-sm">
            <strong>
              ~{stop.est_boxes} {stop.est_boxes === 1 ? "box" : "boxes"}
            </strong>{" "}
            ({stop.book_count} {TEXTBOOK_LABEL[stop.textbook_type].toLowerCase()} books)
          </p>
          <p className="text-sm">
            {stop.name} ·{" "}
            <a className="font-bold underline" href={`tel:+1${stop.phone}`}>
              Call {formatPhone(stop.phone)}
            </a>
          </p>
          {stop.notes && (
            <p className="mt-2 bg-tint px-2 py-1 text-sm">
              <span className="font-bold">Note:</span> {stop.notes}
            </p>
          )}
        </div>
      </div>

      {cancelled ? (
        <p className="mt-3 bg-zinc-100 px-3 py-2 text-sm font-bold text-zinc-800">
          Cancelled by the resident. Skip this stop.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={googleMapsUrl(stop)} target="_blank" rel="noopener noreferrer" className={maps}>
            Open in Google Maps
          </a>
          <a href={appleMapsUrl(stop)} target="_blank" rel="noopener noreferrer" className={maps}>
            Open in Apple Maps
          </a>
          {picked ? (
            <Button
              size="lg"
              className="col-span-2"
              disabled={busy}
              onClick={() => onMark(stop, false)}
            >
              ✓ Picked up · Undo
            </Button>
          ) : (
            <Button
              size="lg"
              variant="primary"
              className="col-span-2"
              disabled={busy}
              onClick={() => onMark(stop, true)}
            >
              Mark picked up
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
