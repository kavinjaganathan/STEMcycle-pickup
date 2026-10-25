import type { Depot, RoutingInputs, SavePlanInput } from "@/lib/db/routing";
import { hourBlocks } from "@/lib/format";
import { solveFallback } from "./fallback";
import type { Matrix } from "./matrix";
import {
  secToTime,
  type Job,
  type LatLng,
  type Problem,
  type Solution,
  type Vehicle,
} from "./types";

export const ROUTE_COLORS = [
  "#8f3ba5",
  "#1d4ed8",
  "#c2410c",
  "#15803d",
  "#be123c",
  "#0f766e",
  "#a16207",
  "#4338ca",
];

export const REASONS = {
  noDepot: "Set the depot location in Settings so routes can be planned.",
  location: "Location needs checking: fix it on the Pickups page.",
  noDriver: "No driver is available at this time.",
  pinnedAway: "The assigned driver isn't available at this time.",
  tooBig: "More boxes than any available vehicle holds.",
  noFit: "Didn't fit: drivers' hours, vehicle space or route length.",
} as const;

export type PlanDeps = {
  buildMatrix: (points: LatLng[]) => Promise<Matrix>;
  solveRemote: (p: Problem) => Promise<Solution | null>;
  routeLine: (points: LatLng[]) => Promise<[number, number][]>;
};

type Block = { vehicleId: string; driverId: string; start: number; end: number };

/**
 * Builds the routing problem for one weekend day:
 *  - every contiguous block of a driver's declared hours becomes a "vehicle"
 *    that leaves the depot at the block start and must be back within the
 *    return buffer after the block ends;
 *  - every located pickup becomes a job with its 1-hour slot as the time
 *    window, its estimated boxes as demand, and only the blocks that cover its
 *    hour (of the pinned driver, if the admin assigned one) as allowed vehicles.
 * Pickups that can't be routed at all get a reason up front.
 */
export function buildProblem(inputs: RoutingInputs, depot: LatLng) {
  const s = inputs.settings;
  const blocks: Block[] = [];
  const vehicles: Vehicle[] = [];
  for (const d of inputs.drivers) {
    for (const [start, end] of hourBlocks(d.hours)) {
      const id = `${d.id}@${start}`;
      blocks.push({ vehicleId: id, driverId: d.id, start, end });
      const shiftEnd = end * 3600 + s.return_buffer_min * 60;
      vehicles.push({
        id,
        start_node: 0,
        end_node: 0,
        capacity: d.capacity_boxes,
        shift_start: start * 3600,
        shift_end: shiftEnd,
        max_duration: Math.min(s.max_route_min * 60, shiftEnd - start * 3600),
      });
    }
  }
  const capacityOf = new Map(inputs.drivers.map((d) => [d.id, d.capacity_boxes]));

  const unassigned: SavePlanInput["unassigned"] = [];
  const routable: { pickup: RoutingInputs["pickups"][number]; allowed: string[] }[] = [];
  for (const p of inputs.pickups) {
    if (p.geocode_status !== "ok" || p.lat === null || p.lng === null) {
      unassigned.push({ pickup_id: p.id, reason: REASONS.location });
      continue;
    }
    const covering = blocks.filter((b) => b.start <= p.slot_hour && p.slot_hour < b.end);
    const candidates = p.pinned_driver_id
      ? covering.filter((b) => b.driverId === p.pinned_driver_id)
      : covering;
    if (candidates.length === 0) {
      unassigned.push({
        pickup_id: p.id,
        reason: p.pinned_driver_id && covering.length ? REASONS.pinnedAway : REASONS.noDriver,
      });
      continue;
    }
    const fits = candidates.filter((b) => (capacityOf.get(b.driverId) ?? 0) >= p.est_boxes);
    if (fits.length === 0) {
      unassigned.push({ pickup_id: p.id, reason: REASONS.tooBig });
      continue;
    }
    routable.push({ pickup: p, allowed: fits.map((b) => b.vehicleId) });
  }

  // Node 0 is the depot; job i is node i + 1.
  const points: LatLng[] = [
    depot,
    ...routable.map((r) => ({ lat: r.pickup.lat!, lng: r.pickup.lng! })),
  ];
  const jobs: Job[] = routable.map((r, i) => ({
    id: r.pickup.id,
    node: i + 1,
    demand: r.pickup.est_boxes,
    service:
      (s.service_min_base + s.service_min_per_50_books * Math.ceil(r.pickup.book_count / 50)) * 60,
    tw: [r.pickup.slot_hour * 3600, (r.pickup.slot_hour + 1) * 3600],
    vehicles: r.allowed,
  }));
  return { vehicles, jobs, points, unassigned, blocks };
}

/** Plans one day end to end and returns the plan to save (published on save). */
export async function planDay(
  deps: PlanDeps,
  date: string,
  inputs: RoutingInputs,
): Promise<SavePlanInput> {
  const s = inputs.settings;
  if (s.depot_lat === null || s.depot_lng === null) {
    return {
      plan_date: date,
      solver: "none",
      matrix_provider: "none",
      depot: null,
      unassigned: inputs.pickups.map((p) => ({ pickup_id: p.id, reason: REASONS.noDepot })),
      routes: [],
    };
  }
  const depot: Depot = {
    name: s.depot_name,
    address: s.depot_address,
    lat: s.depot_lat,
    lng: s.depot_lng,
  };
  const { vehicles, jobs, points, unassigned, blocks } = buildProblem(inputs, depot);

  let solution: Solution = { status: "empty", routes: [], unassigned: [] };
  let solver: SavePlanInput["solver"] = "none";
  let matrix: Matrix = { durations: [[0]], distances: null, provider: "fake" };
  if (jobs.length > 0) {
    matrix = await deps.buildMatrix(points);
    const problem: Problem = {
      durations: matrix.durations,
      jobs,
      vehicles,
      time_limit_seconds: Math.min(30, 5 + Math.ceil(jobs.length / 10)),
    };
    const remote = await deps.solveRemote(problem);
    if (remote && isValidSolution(problem, remote)) {
      solution = remote;
      solver = "ortools";
    } else {
      solution = solveFallback(problem);
      solver = "fallback";
    }
  }
  for (const id of solution.unassigned) unassigned.push({ pickup_id: id, reason: REASONS.noFit });

  const driverOf = new Map(blocks.map((b) => [b.vehicleId, b.driverId]));
  const nameOf = new Map(inputs.drivers.map((d) => [d.id, d.full_name]));
  const colorOf = new Map(
    inputs.drivers.map((d, i) => [d.id, ROUTE_COLORS[i % ROUTE_COLORS.length]]),
  );
  const jobById = new Map(jobs.map((j) => [j.id, j]));

  const routes: SavePlanInput["routes"] = [];
  for (const r of [...solution.routes].sort((a, b) => a.start - b.start)) {
    const driverId = driverOf.get(r.vehicle_id)!;
    const nodes = [0, ...r.stops.map((st) => jobById.get(st.job_id)!.node), 0];
    const meters = matrix.distances
      ? nodes.slice(1).reduce((sum, n, k) => sum + matrix.distances![nodes[k]][n], 0)
      : null;
    routes.push({
      driver_id: driverId,
      driver_name: nameOf.get(driverId) ?? "Driver",
      color: colorOf.get(driverId)!,
      start_at: secToTime(r.start),
      end_at: secToTime(r.end),
      total_seconds: r.end - r.start,
      total_meters: meters === null ? null : Math.round(meters),
      total_boxes: r.load,
      geometry: await deps.routeLine(nodes.map((n) => points[n])),
      stops: r.stops.map((st, k) => ({
        pickup_id: st.job_id,
        seq: k + 1,
        eta: secToTime(st.arrival),
        depart: secToTime(st.departure),
      })),
    });
  }

  return {
    plan_date: date,
    solver,
    matrix_provider: jobs.length ? matrix.provider : "none",
    depot,
    unassigned,
    routes,
  };
}

/** Guards against a misbehaving remote solver: every job once, on an allowed vehicle. */
export function isValidSolution(p: Problem, s: Solution): boolean {
  const jobs = new Map(p.jobs.map((j) => [j.id, j]));
  const vehicleIds = new Set(p.vehicles.map((v) => v.id));
  const seen = new Set<string>();
  for (const r of s.routes ?? []) {
    if (!vehicleIds.has(r.vehicle_id)) return false;
    for (const st of r.stops) {
      const job = jobs.get(st.job_id);
      if (!job || seen.has(st.job_id)) return false;
      if (job.vehicles && !job.vehicles.includes(r.vehicle_id)) return false;
      seen.add(st.job_id);
    }
  }
  for (const id of s.unassigned ?? []) {
    if (!jobs.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return seen.size === jobs.size;
}
