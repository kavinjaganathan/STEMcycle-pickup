"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MapLine, MapMarker } from "@/components/map/LeafletMap";
import { Button, Card, Field, inputClass, Notice, PageHeader, Spinner } from "@/components/ui";
import { api, errorText } from "@/lib/client/api";
import type { AdminPickup, Depot, RoutePlan, TeamUser, Vehicle } from "@/lib/db/admin";
import { addDays } from "@/lib/dates";
import { formatSlotDate, formatTime, formatWindow } from "@/lib/format";
import { useLoad } from "./useLoad";

const LeafletMap = dynamic(() => import("@/components/map/LeafletMap").then((m) => m.LeafletMap), {
  ssr: false,
  loading: () => <div className="h-[420px] animate-pulse rounded-lg bg-brand-soft" />,
});

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

const miles = (m: number | null) => (m === null ? null : `${(m / 1609.34).toFixed(1)} mi`);

export function RoutesAdmin() {
  const [date, setDate] = useState(() => addDays(localToday(), 1));
  const { data: depots } = useLoad("/api/admin/depots", (b: { depots: Depot[] }) => b.depots);
  const { data: vehicles } = useLoad(
    "/api/admin/vehicles",
    (b: { vehicles: Vehicle[] }) => b.vehicles,
  );
  const { data: users } = useLoad("/api/admin/users", (b: { users: TeamUser[] }) => b.users);
  const { data: settings } = useLoad(
    "/api/admin/settings",
    (b: { settings: { default_start_time: string } }) => b.settings,
  );

  const [startDepot, setStartDepot] = useState("");
  const [endDepot, setEndDepot] = useState("");
  const [startTime, setStartTime] = useState("");
  const [selected, setSelected] = useState<
    Record<string, { use: boolean; driver_id: string | null }>
  >({});

  const [plan, setPlan] = useState<RoutePlan | null | undefined>(undefined);
  const [pickups, setPickups] = useState<AdminPickup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"plan" | "publish" | "discard" | null>(null);

  // Sensible defaults once reference data arrives.
  const defaultDepot = depots?.find((d) => d.is_default) ?? depots?.[0];
  const sd = startDepot || defaultDepot?.id || "";
  const ed = endDepot || sd;
  const st = startTime || settings?.default_start_time.slice(0, 5) || "08:30";
  const activeVehicles = useMemo(() => (vehicles ?? []).filter((v) => v.active), [vehicles]);
  const choice = (v: Vehicle) => selected[v.id] ?? { use: true, driver_id: v.default_driver_id };
  const drivers = (users ?? []).filter((u) => u.active);

  const loadDay = useCallback(async () => {
    setError(null);
    try {
      const [p, list] = await Promise.all([
        api<{ plan: RoutePlan | null }>(`/api/admin/routes?date=${date}`),
        api<{ pickups: AdminPickup[] }>(
          `/api/admin/pickups?from=${date}&to=${date}&status=pending,scheduled`,
        ),
      ]);
      setPlan(p.plan);
      setPickups(list.pickups);
    } catch (err) {
      setError(errorText(err));
    }
  }, [date]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDay();
  }, [loadDay]);

  async function runPlan(e: React.FormEvent) {
    e.preventDefault();
    setBusy("plan");
    setError(null);
    try {
      await api("/api/admin/routes/plan", {
        method: "POST",
        body: {
          date,
          start_depot_id: sd,
          end_depot_id: ed,
          start_time: st,
          vehicles: activeVehicles
            .filter((v) => choice(v).use)
            .map((v) => ({ vehicle_id: v.id, driver_id: choice(v).driver_id })),
        },
      });
      await loadDay();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function act(kind: "publish" | "discard") {
    if (!plan) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === "publish") await api(`/api/admin/routes/${plan.id}/publish`, { method: "POST" });
      else await api(`/api/admin/routes/${plan.id}`, { method: "DELETE" });
      await loadDay();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  const needsFix = pickups?.filter((p) => p.geocode_status !== "ok").length ?? 0;
  const ready = depots !== null && vehicles !== null;

  return (
    <>
      <PageHeader title="Route planner" />
      <Card className="mb-4">
        <form onSubmit={runPlan} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Date">
              {(id) => (
                <input
                  id={id}
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="Start depot">
              {(id) => (
                <select
                  id={id}
                  value={sd}
                  onChange={(e) => setStartDepot(e.target.value)}
                  className={inputClass}
                >
                  {(depots ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="End depot">
              {(id) => (
                <select
                  id={id}
                  value={ed}
                  onChange={(e) => setEndDepot(e.target.value)}
                  className={inputClass}
                >
                  {(depots ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Drivers leave at">
              {(id) => (
                <input
                  id={id}
                  type="time"
                  required
                  value={st}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Vehicles and drivers</legend>
            {activeVehicles.length === 0 ? (
              <p className="text-sm text-muted">
                No vehicles yet.{" "}
                <Link className="underline" href="/admin/vehicles">
                  Add one
                </Link>
                .
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {activeVehicles.map((v) => {
                  const c = choice(v);
                  return (
                    <li
                      key={v.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-2"
                    >
                      <label className="flex min-w-36 flex-1 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[var(--brand)]"
                          checked={c.use}
                          onChange={(e) =>
                            setSelected({ ...selected, [v.id]: { ...c, use: e.target.checked } })
                          }
                        />
                        <span>
                          <span className="font-medium">{v.name}</span>
                          <span className="text-muted">
                            {" "}
                            · {v.capacity_books} books · {v.max_route_min} min
                          </span>
                        </span>
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <span className="sr-only">Driver for {v.name}</span>
                        <select
                          value={c.driver_id ?? ""}
                          onChange={(e) =>
                            setSelected({
                              ...selected,
                              [v.id]: { ...c, driver_id: e.target.value || null },
                            })
                          }
                          className={`${inputClass} w-auto`}
                          disabled={!c.use}
                        >
                          <option value="">No driver yet</option>
                          {drivers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.full_name || u.email}
                            </option>
                          ))}
                        </select>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>

          <p className="text-sm text-muted" aria-live="polite">
            {pickups === null
              ? "Counting pickups…"
              : `${pickups.length} pickup${pickups.length === 1 ? "" : "s"} on ${formatSlotDate(date)}`}
            {needsFix > 0 && (
              <>
                {" "}
                ·{" "}
                <Link href="/admin" className="font-semibold text-danger underline">
                  {needsFix} need a location check
                </Link>{" "}
                and will be skipped
              </>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              variant="primary"
              disabled={
                !ready || busy !== null || !sd || activeVehicles.every((v) => !choice(v).use)
              }
            >
              {busy === "plan" ? "Planning…" : plan ? "Re-plan routes" : "Plan routes"}
            </Button>
            {busy === "plan" && (
              <span className="text-sm text-muted" role="status">
                This can take up to a minute while the optimizer wakes up.
              </span>
            )}
          </div>
        </form>
      </Card>

      {error && (
        <div className="mb-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {plan === undefined ? (
        <Spinner />
      ) : plan === null ? (
        <Card>
          <p className="text-sm text-muted">No routes planned for this day yet.</p>
        </Card>
      ) : (
        <PlanView
          plan={plan}
          busy={busy}
          onPublish={() => act("publish")}
          onDiscard={() => act("discard")}
        />
      )}
    </>
  );
}

function PlanView({
  plan,
  busy,
  onPublish,
  onDiscard,
}: {
  plan: RoutePlan;
  busy: string | null;
  onPublish: () => void;
  onDiscard: () => void;
}) {
  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = [];
    for (const d of [plan.start_depot, plan.end_depot]) {
      if (d && !m.some((x) => x.id === d.id))
        m.push({
          id: d.id,
          lat: d.lat,
          lng: d.lng,
          title: `Depot: ${d.name}`,
          label: "D",
          color: "#1c2b24",
          shape: "square",
        });
    }
    for (const r of plan.routes) {
      for (const s of r.stops)
        m.push({
          id: s.id,
          lat: s.lat,
          lng: s.lng,
          title: `${r.vehicle_name} stop ${s.seq}: ${s.name}`,
          label: String(s.seq),
          color: r.color,
        });
    }
    return m;
  }, [plan]);
  const lines = useMemo<MapLine[]>(
    () => plan.routes.map((r) => ({ id: r.id, points: r.geometry, color: r.color })),
    [plan],
  );
  const totalStops = plan.routes.reduce((n, r) => n + r.stops.length, 0);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="font-semibold">
              {plan.status === "published"
                ? "Published: drivers can see these routes"
                : "Draft: not visible to drivers yet"}
            </p>
            <p className="text-sm text-muted">
              {totalStops} stops on {plan.routes.length} route{plan.routes.length === 1 ? "" : "s"}{" "}
              · leaving at {formatTime(plan.start_time)} ·{" "}
              {plan.solver === "ortools"
                ? "optimized with OR-Tools"
                : "planned with the backup planner"}{" "}
              · travel times from{" "}
              {plan.matrix_provider === "ors"
                ? "OpenRouteService"
                : plan.matrix_provider === "osrm"
                  ? "OSRM"
                  : "test data"}
            </p>
            {plan.status === "draft" && plan.has_published && (
              <p className="text-sm text-muted">
                Publishing replaces the routes drivers currently see for this day.
              </p>
            )}
          </div>
          {plan.status === "draft" && (
            <div className="flex gap-2">
              <Button onClick={onDiscard} disabled={busy !== null}>
                Discard draft
              </Button>
              <Button
                variant="primary"
                onClick={onPublish}
                disabled={busy !== null || plan.routes.length === 0}
              >
                {busy === "publish" ? "Publishing…" : "Publish to drivers"}
              </Button>
            </div>
          )}
        </div>
        {plan.solver === "fallback" && totalStops > 0 && (
          <div className="mt-3">
            <Notice>
              The optimizer was unavailable, so a simpler planner was used. Routes respect every
              time window and limit but may be a little longer. Try re-planning in a minute.
            </Notice>
          </div>
        )}
      </Card>

      {totalStops > 0 && (
        <LeafletMap
          label="Map of planned routes"
          className="h-[420px]"
          markers={markers}
          lines={lines}
          fitKey={plan.id}
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {plan.routes.map((r) => (
          <Card key={r.id}>
            <h2 className="flex items-center gap-2 font-semibold">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-full"
                style={{ background: r.color }}
              />
              {r.vehicle_name} ·{" "}
              {r.driver_name || <span className="text-danger">no driver assigned</span>}
            </h2>
            <p className="mb-3 text-sm text-muted">
              {r.stops.length} stops · {r.total_books} books · {formatTime(r.start_at)}–
              {formatTime(r.end_at)} ({formatDuration(r.total_seconds)})
              {miles(r.total_meters) ? ` · ${miles(r.total_meters)}` : ""}
            </p>
            <ol className="space-y-2">
              {r.stops.map((s) => (
                <li key={s.id} className="flex gap-3 text-sm">
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ background: r.color }}
                    aria-hidden="true"
                  >
                    {s.seq}
                  </span>
                  <div className="min-w-0">
                    <p>
                      <span className="font-semibold">ETA {formatTime(s.eta)}</span> · {s.name} ·{" "}
                      {s.book_count} books
                      {s.status === "picked_up" && (
                        <span className="ml-1 font-semibold text-brand">· ✓ picked up</span>
                      )}
                      {s.status === "cancelled" && (
                        <span className="ml-1 font-semibold text-danger">· cancelled</span>
                      )}
                    </p>
                    <p className="text-muted">
                      {s.address_line}, {s.city} · window {formatWindow(s)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </div>

      {plan.unassigned.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold text-danger">
            Not scheduled ({plan.unassigned.length})
          </h2>
          <ul className="space-y-1 text-sm">
            {plan.unassigned.map((u) => (
              <li key={u.pickup_id}>
                <span className="font-medium">{u.name}</span>, {u.address_line}, {u.city} (
                {u.book_count} books): <span className="text-muted">{u.reason}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
