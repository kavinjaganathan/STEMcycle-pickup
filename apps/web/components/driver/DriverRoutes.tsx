"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Notice, Spinner } from "@/components/ui";
import { api, ApiError, errorText } from "@/lib/client/api";
import { addDays } from "@/lib/dates";
import type { DriverRoute, DriverStop } from "@/lib/db/driver";
import { formatSlotDate, formatTime, formatWindow } from "@/lib/format";
import { formatPhone } from "@/lib/validation";
import { appleMapsUrl, googleMapsUrl, googleMultiStopUrl } from "./links";

const LeafletMap = dynamic(() => import("@/components/map/LeafletMap").then((m) => m.LeafletMap), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-lg bg-brand-soft" />,
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

export function DriverRoutes({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const [routes, setRoutes] = useState<DriverRoute[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(0);
  const [busyStop, setBusyStop] = useState<string | null>(null);
  const routesRef = useRef(routes);
  useEffect(() => {
    routesRef.current = routes;
  }, [routes]);

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
      const res = await api<{ routes: DriverRoute[] }>(`/api/driver/routes?date=${date}`);
      // Re-apply anything still queued so the screen matches what the driver tapped.
      const pending = new Map(readQueue().map((q) => [q.stopId, q.pickedUp]));
      setRoutes(
        res.routes.map((r) => ({
          ...r,
          stops: r.stops.map((s) =>
            pending.has(s.id) ? { ...s, status: pending.get(s.id) ? "picked_up" : "scheduled" } : s,
          ),
        })),
      );
      setError(null);
    } catch (err) {
      // Keep showing the last list we had: a lost signal shouldn't blank the page.
      setError(
        routesRef.current ? "No connection. Showing your last loaded route." : errorText(err),
      );
    }
  }, [date, flushQueue]);

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
    setRoutes(
      (rs) =>
        rs &&
        rs.map((r) => ({
          ...r,
          stops: r.stops.map((s) => (s.id === stopId ? { ...s, status } : s)),
        })),
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

  const isToday = date === today;

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button
          size="sm"
          onClick={() => {
            setRoutes(null);
            setDate(addDays(date, -1));
          }}
          aria-label="Previous day"
        >
          ‹ Prev
        </Button>
        <h1 className="text-center text-xl font-bold tracking-tight">
          {isToday ? "Today" : formatSlotDate(date)}
          {isToday && (
            <span className="block text-sm font-normal text-muted">{formatSlotDate(date)}</span>
          )}
        </h1>
        <Button
          size="sm"
          onClick={() => {
            setRoutes(null);
            setDate(addDays(date, 1));
          }}
          aria-label="Next day"
        >
          Next ›
        </Button>
      </div>

      <div className="mb-4 flex items-center justify-center gap-2 text-sm">
        <label htmlFor="driver-day" className="text-muted">
          Day
        </label>
        <input
          id="driver-day"
          type="date"
          value={date}
          onChange={(e) => {
            if (!e.target.value) return;
            setRoutes(null);
            setDate(e.target.value);
          }}
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-text"
        />
        {!isToday && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setRoutes(null);
              setDate(today);
            }}
          >
            Back to today
          </Button>
        )}
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

      {routes === null ? (
        <Spinner label="Loading your route…" />
      ) : routes.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-4 text-center text-muted">
          No route assigned to you for this day.
        </p>
      ) : (
        routes.map((r) => <RouteView key={r.id} route={r} busyStop={busyStop} onMark={mark} />)
      )}
    </div>
  );
}

function RouteView({
  route,
  busyStop,
  onMark,
}: {
  route: DriverRoute;
  busyStop: string | null;
  onMark: (s: DriverStop, picked: boolean) => void;
}) {
  const [showMap, setShowMap] = useState(false);
  const active = route.stops.filter((s) => s.status !== "cancelled");
  const done = active.filter((s) => s.status === "picked_up").length;
  const remaining = active.filter((s) => s.status !== "picked_up");
  const next = remaining[0];
  const multi = googleMultiStopUrl(remaining.map((s) => ({ lat: s.lat, lng: s.lng })));

  const markers = useMemo(
    () => [
      ...(route.start_depot
        ? [
            {
              id: "depot",
              lat: route.start_depot.lat,
              lng: route.start_depot.lng,
              title: `Depot: ${route.start_depot.name}`,
              label: "D",
              color: "#1c2b24",
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
        color: s.status === "picked_up" ? "#6b7280" : route.color,
      })),
    ],
    [route],
  );

  return (
    <section aria-labelledby={`route-${route.id}`} className="mb-6">
      <div className="mb-3 rounded-xl border border-border bg-surface p-4">
        <h2 id={`route-${route.id}`} className="text-lg font-semibold">
          {route.vehicle_name}
        </h2>
        <p className="text-sm text-muted">
          Leave {route.start_depot?.name ?? "depot"} at {formatTime(route.start_at)} · back about{" "}
          {formatTime(route.end_at)} · {route.total_books} books
        </p>
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-sm">
            <span>
              {done} of {active.length} picked up
            </span>
            <span className="text-muted">{remaining.length} to go</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-brand-soft"
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
        <div className="mt-3 flex flex-wrap gap-2">
          {multi && remaining.length > 1 && (
            <a
              href={multi}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-brand-soft"
            >
              Navigate next {Math.min(remaining.length, 10)} stops (Google Maps)
            </a>
          )}
          <Button size="md" onClick={() => setShowMap((v) => !v)} aria-expanded={showMap}>
            {showMap ? "Hide map" : "Show map"}
          </Button>
        </div>
        {showMap && (
          <div className="mt-3">
            <LeafletMap
              label="Route map"
              className="h-64"
              markers={markers}
              lines={[]}
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
              color={route.color}
              isNext={s.id === next?.id}
              busy={busyStop === s.id}
              onMark={onMark}
            />
          </li>
        ))}
      </ol>
      {route.end_depot && remaining.length === 0 && active.length > 0 && (
        <p className="mt-4 rounded-xl border border-brand bg-brand-soft p-4 text-center font-medium">
          All done. Head back to {route.end_depot.name}. Thank you! 🎉
        </p>
      )}
    </section>
  );
}

function StopCard({
  stop,
  color,
  isNext,
  busy,
  onMark,
}: {
  stop: DriverStop;
  color: string;
  isNext: boolean;
  busy: boolean;
  onMark: (s: DriverStop, picked: boolean) => void;
}) {
  const picked = stop.status === "picked_up";
  const cancelled = stop.status === "cancelled";
  return (
    <article
      aria-label={`Stop ${stop.seq}: ${stop.address_line}`}
      className={`rounded-xl border bg-surface p-4 shadow-sm ${isNext ? "border-brand ring-2 ring-brand" : "border-border"} ${picked || cancelled ? "opacity-70" : ""}`}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ background: picked ? "#6b7280" : color }}
          aria-hidden="true"
        >
          {picked ? "✓" : stop.seq}
        </span>
        <div className="min-w-0 flex-1">
          {isNext && (
            <p className="text-xs font-bold uppercase tracking-wide text-brand">Next stop</p>
          )}
          <p className="text-lg font-semibold leading-snug">{stop.address_line}</p>
          <p className="text-muted">
            {stop.city} {stop.zip}
          </p>
          <p className="mt-1 text-sm">
            ETA <strong>{formatTime(stop.eta)}</strong> · window {formatWindow(stop)} ·{" "}
            <strong>{stop.book_count} books</strong>
          </p>
          <p className="text-sm">
            {stop.name} ·{" "}
            <a className="underline" href={`tel:+1${stop.phone}`}>
              Call {formatPhone(stop.phone)}
            </a>
          </p>
          {stop.notes && (
            <p className="mt-1 rounded-md bg-brand-soft px-2 py-1 text-sm">📝 {stop.notes}</p>
          )}
        </div>
      </div>

      {cancelled ? (
        <p className="mt-3 rounded-lg bg-zinc-200 px-3 py-2 text-sm font-medium text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100">
          Cancelled by the resident. Skip this stop.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a
            href={googleMapsUrl(stop)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-border px-3 py-3 text-center text-sm font-semibold hover:bg-brand-soft"
          >
            Google Maps
          </a>
          <a
            href={appleMapsUrl(stop)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-border px-3 py-3 text-center text-sm font-semibold hover:bg-brand-soft"
          >
            Apple Maps
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
