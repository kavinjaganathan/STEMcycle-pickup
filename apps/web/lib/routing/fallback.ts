import type { Job, Problem, Solution, SolvedRoute, Vehicle } from "./types";

/**
 * Fallback planner used when the OR-Tools service is unavailable:
 * nearest-neighbour construction, 2-opt improvement and cheapest insertion of
 * leftovers, all honouring time windows, capacity and max route duration.
 */
export function solveFallback(p: Problem): Solution {
  const remaining = new Set(p.jobs.map((j) => j.id));
  const byId = new Map(p.jobs.map((j) => [j.id, j]));
  const orders: Job[][] = [];

  for (const v of p.vehicles) {
    const order: Job[] = [];
    for (;;) {
      let best: { job: Job; score: number } | null = null;
      const current = simulate(p, v, order);
      const t = current ? current.lastDeparture : v.shift_start;
      for (const id of remaining) {
        const job = byId.get(id)!;
        const sim = simulate(p, v, [...order, job]);
        if (!sim) continue;
        // Time until service can start: travel plus any waiting.
        const score = sim.stops[sim.stops.length - 1].arrival - t;
        if (!best || score < best.score) best = { job, score };
      }
      if (!best) break;
      order.push(best.job);
      remaining.delete(best.job.id);
    }
    orders.push(twoOpt(p, v, order));
  }

  // Try to squeeze leftovers into any route at their cheapest feasible position.
  for (const id of [...remaining]) {
    const job = byId.get(id)!;
    let best: { v: number; pos: number; cost: number } | null = null;
    p.vehicles.forEach((v, vi) => {
      const base = simulate(p, v, orders[vi])?.duration ?? 0;
      for (let pos = 0; pos <= orders[vi].length; pos++) {
        const trial = [...orders[vi].slice(0, pos), job, ...orders[vi].slice(pos)];
        const sim = simulate(p, v, trial);
        if (sim && (!best || sim.duration - base < best.cost))
          best = { v: vi, pos, cost: sim.duration - base };
      }
    });
    if (best) {
      const b = best as { v: number; pos: number };
      orders[b.v].splice(b.pos, 0, job);
      remaining.delete(id);
    }
  }

  const routes: SolvedRoute[] = [];
  p.vehicles.forEach((v, vi) => {
    const sim = simulate(p, v, orders[vi]);
    if (!sim || orders[vi].length === 0) return;
    routes.push({
      vehicle_id: v.id,
      start: sim.start,
      end: sim.end,
      load: orders[vi].reduce((n, j) => n + j.demand, 0),
      stops: sim.stops,
    });
  });
  return {
    status: "fallback",
    routes,
    unassigned: p.jobs.filter((j) => remaining.has(j.id)).map((j) => j.id),
  };
}

type Sim = {
  start: number;
  end: number;
  duration: number;
  lastDeparture: number;
  stops: { job_id: string; arrival: number; departure: number }[];
};

/** Times for visiting `order` in sequence, or null if any constraint breaks. */
export function simulate(p: Problem, v: Vehicle, order: Job[]): Sim | null {
  const d = p.durations;
  let t = v.shift_start;
  let node = v.start_node;
  let load = 0;
  const stops: Sim["stops"] = [];
  for (const job of order) {
    const arrival = Math.max(t + d[node][job.node], job.tw[0]);
    if (arrival > job.tw[1]) return null;
    load += job.demand;
    if (load > v.capacity) return null;
    t = arrival + job.service;
    stops.push({ job_id: job.id, arrival, departure: t });
    node = job.node;
  }
  const end = t + d[node][v.end_node];
  // Leave the depot as late as possible without delaying the first stop.
  const start = order.length
    ? Math.max(v.shift_start, stops[0].arrival - d[v.start_node][order[0].node])
    : v.shift_start;
  if (end - start > v.max_duration) return null;
  return { start, end, duration: end - start, lastDeparture: t, stops };
}

function twoOpt(p: Problem, v: Vehicle, order: Job[]): Job[] {
  let best = order;
  let bestDur = simulate(p, v, best)?.duration ?? Infinity;
  let improved = true;
  for (let round = 0; improved && round < 50; round++) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const trial = [
          ...best.slice(0, i),
          ...best.slice(i, k + 1).reverse(),
          ...best.slice(k + 1),
        ];
        const sim = simulate(p, v, trial);
        if (sim && sim.duration < bestDur) {
          best = trial;
          bestDur = sim.duration;
          improved = true;
        }
      }
    }
  }
  return best;
}
