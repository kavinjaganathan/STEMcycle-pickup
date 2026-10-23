import { describe, expect, it } from "vitest";
import { simulate, solveFallback } from "@/lib/routing/fallback";
import type { Problem, Solution } from "@/lib/routing/types";

const H = 3600;

function grid(points: [number, number][]) {
  return points.map((a) =>
    points.map((b) => Math.round((Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])) * 60)),
  );
}

/** Same invariants as services/solver/test_solver.py::check_routes. */
function check(p: Problem, s: Solution) {
  const jobs = new Map(p.jobs.map((j) => [j.id, j]));
  const seen = new Set<string>();
  for (const r of s.routes) {
    const v = p.vehicles.find((x) => x.id === r.vehicle_id)!;
    expect(r.load).toBeLessThanOrEqual(v.capacity);
    expect(r.end - r.start).toBeLessThanOrEqual(v.max_duration);
    let node = v.start_node;
    let dep = r.start;
    for (const st of r.stops) {
      const j = jobs.get(st.job_id)!;
      expect(st.arrival).toBeGreaterThanOrEqual(j.tw[0]);
      expect(st.arrival).toBeLessThanOrEqual(j.tw[1]);
      expect(st.arrival).toBeGreaterThanOrEqual(dep + p.durations[node][j.node]);
      node = j.node;
      dep = st.departure;
      expect(seen.has(st.job_id)).toBe(false);
      seen.add(st.job_id);
    }
  }
  for (const id of s.unassigned) seen.add(id);
  expect(seen.size).toBe(p.jobs.length);
}

describe("solveFallback", () => {
  it("visits a tight-window stop first", () => {
    const p: Problem = {
      durations: grid([
        [0, 0],
        [10, 0],
        [20, 0],
        [30, 0],
      ]),
      jobs: [
        { id: "far", node: 3, demand: 10, service: 300, tw: [9 * H, 9 * H + 600] },
        { id: "near", node: 1, demand: 10, service: 300, tw: [9 * H, 12 * H] },
        { id: "mid", node: 2, demand: 10, service: 300, tw: [9 * H, 12 * H] },
      ],
      vehicles: [
        {
          id: "v",
          start_node: 0,
          end_node: 0,
          capacity: 100,
          shift_start: 8.5 * H,
          max_duration: 6 * H,
        },
      ],
    };
    const s = solveFallback(p);
    check(p, s);
    expect(s.unassigned).toEqual([]);
    expect(s.routes[0].stops[0].job_id).toBe("far");
  });

  it("splits by capacity and reports what can't fit", () => {
    const pts: [number, number][] = [
      [0, 0],
      ...Array.from({ length: 6 }, (_, i) => [i + 1, i + 1] as [number, number]),
    ];
    const p: Problem = {
      durations: grid(pts),
      jobs: [
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `j${i}`,
          node: i + 1,
          demand: 150,
          service: 300,
          tw: [9 * H, 16 * H] as [number, number],
        })),
        { id: "huge", node: 6, demand: 900, service: 300, tw: [9 * H, 16 * H] },
      ],
      vehicles: ["a", "b"].map((id) => ({
        id,
        start_node: 0,
        end_node: 0,
        capacity: 450,
        shift_start: 9 * H,
        max_duration: 8 * H,
      })),
    };
    const s = solveFallback(p);
    check(p, s);
    expect(s.unassigned).toEqual(["huge"]);
    expect(s.routes).toHaveLength(2);
  });

  it("stays feasible on random instances and 2-opt never makes routes longer", () => {
    let seed = 42;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let t = 0; t < 5; t++) {
      const pts: [number, number][] = [
        [0, 0],
        ...Array.from(
          { length: 40 },
          () => [rand() * 40 - 20, rand() * 40 - 20] as [number, number],
        ),
      ];
      const p: Problem = {
        durations: grid(pts),
        jobs: Array.from({ length: 40 }, (_, i) => {
          const start = rand() < 0.5 ? 9 * H : 13 * H;
          return {
            id: `j${i}`,
            node: i + 1,
            demand: Math.ceil(rand() * 80),
            service: 300,
            tw: [start, start + 3 * H] as [number, number],
          };
        }),
        vehicles: [0, 1, 2].map((k) => ({
          id: `v${k}`,
          start_node: 0,
          end_node: 0,
          capacity: 400,
          shift_start: 8.5 * H,
          max_duration: 8 * H,
        })),
      };
      const s = solveFallback(p);
      check(p, s);
      expect(s.routes.reduce((n, r) => n + r.stops.length, 0)).toBeGreaterThan(20);
    }
  });

  it("simulate leaves the depot late enough to avoid waiting at the first stop", () => {
    const p: Problem = {
      durations: grid([
        [0, 0],
        [10, 0],
      ]),
      jobs: [{ id: "a", node: 1, demand: 1, service: 60, tw: [10 * H, 11 * H] }],
      vehicles: [
        { id: "v", start_node: 0, end_node: 0, capacity: 9, shift_start: 8 * H, max_duration: H },
      ],
    };
    const sim = simulate(p, p.vehicles[0], p.jobs);
    expect(sim?.start).toBe(10 * H - 600);
    expect(sim?.duration).toBe(600 + 60 + 600);
  });
});
