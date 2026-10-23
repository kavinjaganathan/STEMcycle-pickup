import { describe, expect, it } from "vitest";
import { solveFallback } from "@/lib/routing/fallback";
import { solveRemote } from "@/lib/routing/solver-client";
import type { Problem } from "@/lib/routing/types";

// Runs against a real solver: SOLVER_URL=http://localhost:8000 SOLVER_SECRET=... npm test
describe.skipIf(!process.env.SOLVER_URL)("OR-Tools service", () => {
  it("solves a 30-stop day and does at least as well as the fallback", async () => {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pts = [[0, 0], ...Array.from({ length: 30 }, () => [rand() * 30 - 15, rand() * 30 - 15])];
    const H = 3600;
    const p: Problem = {
      durations: pts.map((a) =>
        pts.map((b) => Math.round((Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])) * 60)),
      ),
      jobs: Array.from({ length: 30 }, (_, i) => {
        const start = i % 2 ? 9 * H : 13 * H;
        return {
          id: `j${i}`,
          node: i + 1,
          demand: 20,
          service: 300,
          tw: [start, start + 3 * H] as [number, number],
        };
      }),
      vehicles: [0, 1].map((k) => ({
        id: `v${k}`,
        start_node: 0,
        end_node: 0,
        capacity: 400,
        shift_start: 8.5 * H,
        max_duration: 8 * H,
      })),
      time_limit_seconds: 5,
    };
    const remote = await solveRemote(p);
    expect(remote).not.toBeNull();
    const fb = solveFallback(p);
    const total = (s: { routes: { start: number; end: number }[] }) =>
      s.routes.reduce((n, r) => n + r.end - r.start, 0);
    expect(remote!.unassigned.length).toBeLessThanOrEqual(fb.unassigned.length);
    if (remote!.unassigned.length === fb.unassigned.length)
      expect(total(remote!)).toBeLessThanOrEqual(total(fb) * 1.02);
  }, 60_000);
});
