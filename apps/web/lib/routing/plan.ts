import type { AdminApi, AdminPickup, SavePlanInput } from "@/lib/db/admin";
import { solveFallback } from "./fallback";
import type { Matrix } from "./matrix";
import { secToTime, timeToSec, type LatLng, type Problem, type Solution } from "./types";

export const ROUTE_COLORS = [
  "#1d4ed8",
  "#c2410c",
  "#15803d",
  "#7e22ce",
  "#be123c",
  "#0f766e",
  "#a16207",
  "#4338ca",
];

export type PlanRequest = {
  date: string;
  start_depot_id: string;
  end_depot_id: string;
  start_time: string; // HH:MM
  vehicles: { vehicle_id: string; driver_id: string | null }[];
};

export type PlanDeps = {
  admin: AdminApi;
  buildMatrix: (points: LatLng[]) => Promise<Matrix>;
  solveRemote: (p: Problem) => Promise<Solution | null>;
  routeLine: (points: LatLng[]) => Promise<[number, number][]>;
  /** Geocodes any pickups still waiting (best effort). */
  geocodePending?: () => Promise<unknown>;
};

export class PlanError extends Error {}

const REASON_LOCATION = "Location needs checking: fix it on the Pickups page.";
const REASON_TOO_BIG = "More books than any selected vehicle can carry.";
const REASON_NO_FIT = "Didn't fit: time windows, vehicle capacity or max route time.";

/** Builds, solves and saves a draft route plan for one day. */
export async function planRoutes(
  deps: PlanDeps,
  req: PlanRequest,
): Promise<{ id: string; solver: string }> {
  const { admin } = deps;
  if (req.vehicles.length === 0) throw new PlanError("Choose at least one vehicle.");
  await deps.geocodePending?.().catch(() => undefined);

  const [settings, depots, vehicles, pickups] = await Promise.all([
    admin.getSettings(),
    admin.listDepots(),
    admin.listVehicles(),
    admin.listPickups(req.date, req.date, ["pending", "scheduled"]),
  ]);

  const startDepot = depots.find((d) => d.id === req.start_depot_id);
  const endDepot = depots.find((d) => d.id === req.end_depot_id);
  for (const d of [startDepot, endDepot]) {
    if (!d) throw new PlanError("Choose a start and end depot.");
    if (d.lat === null || d.lng === null)
      throw new PlanError(`Depot "${d.name}" has no coordinates yet.`);
  }
  const chosen = req.vehicles.map((sel) => {
    const v = vehicles.find((x) => x.id === sel.vehicle_id && x.active);
    if (!v) throw new PlanError("One of the selected vehicles is no longer available.");
    return { ...v, driver_id: sel.driver_id };
  });

  const maxCapacity = Math.max(...chosen.map((v) => v.capacity_books));
  const unassigned: SavePlanInput["unassigned"] = [];
  const routable: AdminPickup[] = [];
  for (const p of pickups) {
    if (p.geocode_status !== "ok" || p.lat === null || p.lng === null) {
      unassigned.push({ pickup_id: p.id, reason: REASON_LOCATION });
    } else if (p.book_count > maxCapacity) {
      unassigned.push({ pickup_id: p.id, reason: REASON_TOO_BIG });
    } else {
      routable.push(p);
    }
  }

  // Nodes: 0 = start depot, 1 = end depot (if different), then one per pickup.
  const sameDepot = startDepot!.id === endDepot!.id;
  const depotPoints: LatLng[] = sameDepot
    ? [{ lat: startDepot!.lat!, lng: startDepot!.lng! }]
    : [
        { lat: startDepot!.lat!, lng: startDepot!.lng! },
        { lat: endDepot!.lat!, lng: endDepot!.lng! },
      ];
  const endNode = sameDepot ? 0 : 1;
  const firstJobNode = depotPoints.length;
  const points = [...depotPoints, ...routable.map((p) => ({ lat: p.lat!, lng: p.lng! }))];

  let solution: Solution = { status: "empty", routes: [], unassigned: [] };
  let solver: "ortools" | "fallback" = "fallback";
  let matrix: Matrix = { durations: [[0]], distances: null, provider: "fake" };

  if (routable.length > 0) {
    matrix = await deps.buildMatrix(points);
    const shiftStart = timeToSec(req.start_time);
    const problem: Problem = {
      durations: matrix.durations,
      jobs: routable.map((p, i) => ({
        id: p.id,
        node: firstJobNode + i,
        demand: p.book_count,
        service:
          (settings.service_min_base +
            settings.service_min_per_50_books * Math.ceil(p.book_count / 50)) *
          60,
        tw: [timeToSec(p.start_time), timeToSec(p.end_time)],
      })),
      vehicles: chosen.map((v) => ({
        id: v.id,
        start_node: 0,
        end_node: endNode,
        capacity: v.capacity_books,
        shift_start: shiftStart,
        max_duration: v.max_route_min * 60,
      })),
      time_limit_seconds: Math.min(30, 5 + Math.ceil(routable.length / 10)),
    };
    const remote = await deps.solveRemote(problem);
    if (remote && isValidSolution(problem, remote)) {
      solution = remote;
      solver = "ortools";
    } else {
      solution = solveFallback(problem);
    }
  }

  const pickupById = new Map(routable.map((p) => [p.id, p]));
  const nodeOf = new Map(routable.map((p, i) => [p.id, firstJobNode + i]));
  for (const id of solution.unassigned) unassigned.push({ pickup_id: id, reason: REASON_NO_FIT });

  const routes: SavePlanInput["routes"] = [];
  for (const [i, r] of solution.routes.entries()) {
    const v = chosen.find((x) => x.id === r.vehicle_id)!;
    const stopPoints = r.stops.map((s) => {
      const p = pickupById.get(s.job_id)!;
      return { lat: p.lat!, lng: p.lng! };
    });
    const nodes = [0, ...r.stops.map((s) => nodeOf.get(s.job_id)!), endNode];
    const meters = matrix.distances
      ? nodes.slice(1).reduce((sum, n, k) => sum + matrix.distances![nodes[k]][n], 0)
      : null;
    routes.push({
      vehicle_id: v.id,
      driver_id: v.driver_id,
      vehicle_name: v.name,
      color: ROUTE_COLORS[i % ROUTE_COLORS.length],
      start_at: secToTime(r.start),
      end_at: secToTime(r.end),
      total_seconds: r.end - r.start,
      total_meters: meters,
      total_books: r.load,
      geometry: await deps.routeLine([depotPoints[0], ...stopPoints, depotPoints[endNode]]),
      stops: r.stops.map((s, k) => ({
        pickup_id: s.job_id,
        seq: k + 1,
        eta: secToTime(s.arrival),
        depart: secToTime(s.departure),
      })),
    });
  }

  const saved = await admin.saveRoutePlan({
    plan_date: req.date,
    start_depot_id: startDepot!.id,
    end_depot_id: endDepot!.id,
    start_time: `${req.start_time.slice(0, 5)}:00`,
    solver,
    matrix_provider: matrix.provider,
    unassigned,
    routes,
  });
  return { id: saved.id, solver };
}

/** Guards against a misbehaving remote solver: every job exactly once, known vehicles. */
function isValidSolution(p: Problem, s: Solution): boolean {
  const jobIds = new Set(p.jobs.map((j) => j.id));
  const vehicleIds = new Set(p.vehicles.map((v) => v.id));
  const seen = new Set<string>();
  for (const r of s.routes ?? []) {
    if (!vehicleIds.has(r.vehicle_id)) return false;
    for (const st of r.stops) {
      if (!jobIds.has(st.job_id) || seen.has(st.job_id)) return false;
      seen.add(st.job_id);
    }
  }
  for (const id of s.unassigned ?? []) {
    if (!jobIds.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return seen.size === jobIds.size;
}
