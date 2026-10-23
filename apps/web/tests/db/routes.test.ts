import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createLocalDb } from "@/lib/db/pglite";
import { createAdminApi, type AdminApi } from "@/lib/db/admin";
import { createRepo, pgRpc } from "@/lib/db/repo";
import { fakeMatrix } from "@/lib/routing/matrix";
import { planRoutes, type PlanDeps } from "@/lib/routing/plan";
import type { Solution } from "@/lib/routing/types";

const ADMIN = "00000000-0000-4000-8000-000000000001";
const DRIVER = "00000000-0000-4000-8000-000000000002";

let db: PGlite;
let admin: AdminApi;
let deps: PlanDeps;
let date: string;
let depotId: string;
let vehicleIds: string[];

async function book(n: number, opts: { geocoded?: boolean; books?: number } = {}) {
  const repo = createRepo(pgRpc(db));
  const [slot] = await repo.listAvailableSlots(new Date());
  date = slot.slot_date;
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = await repo.createPickup(
      {
        name: `R${i}`,
        email: `r${i}@x.org`,
        phone: "2145550100",
        address_line: `${i} Main St`,
        city: "Frisco",
        zip: "75034",
        book_count: opts.books ?? 20,
        notes: null,
        slot_id: slot.id,
      },
      `tok-${Math.random()}`,
      new Date(),
    );
    if (r.result !== "ok") throw new Error(r.result);
    if (opts.geocoded !== false) {
      await db.query("update pickups set geocode_status = 'ok', lat = $2, lng = $3 where id = $1", [
        r.pickup_id,
        33.1 + i * 0.01,
        -96.8 + i * 0.005,
      ]);
    }
    ids.push(r.pickup_id);
  }
  return ids;
}

beforeEach(async () => {
  db = await createLocalDb({ seed: true });
  admin = createAdminApi(pgRpc(db, { asUser: ADMIN }));
  deps = {
    admin,
    buildMatrix: async (pts) => fakeMatrix(pts),
    solveRemote: vi.fn(async () => null),
    routeLine: async (pts) => pts.map((p) => [p.lat, p.lng] as [number, number]),
  };
  depotId = (await admin.listDepots())[0].id;
  vehicleIds = (await admin.listVehicles()).map((v) => v.id);
});

const request = () => ({
  date,
  start_depot_id: depotId,
  end_depot_id: depotId,
  start_time: "08:30",
  vehicles: vehicleIds.map((id, i) => ({ vehicle_id: id, driver_id: i === 0 ? DRIVER : null })),
});

describe("planRoutes", () => {
  it("plans with the fallback when the solver is unavailable and saves a draft", async () => {
    const ids = await book(6);
    const [unlocated] = await book(1, { geocoded: false });
    const res = await planRoutes(deps, request());
    expect(res.solver).toBe("fallback");

    const plan = (await admin.getRoutePlan(date))!;
    expect(plan.status).toBe("draft");
    const routed = plan.routes.flatMap((r) => r.stops.map((s) => s.pickup_id));
    expect(routed.sort()).toEqual([...ids].sort());
    expect(plan.unassigned).toEqual([
      expect.objectContaining({ pickup_id: unlocated, reason: expect.stringMatching(/Location/) }),
    ]);
    for (const r of plan.routes) {
      expect(r.stops.map((s) => s.seq)).toEqual(r.stops.map((_, i) => i + 1));
      for (const s of r.stops) expect(s.eta >= s.start_time && s.eta <= s.end_time).toBe(true);
    }
  });

  it("uses the remote solver's answer when it is valid", async () => {
    const ids = await book(2);
    deps.solveRemote = async (p): Promise<Solution> => ({
      status: "optimal",
      unassigned: [],
      routes: [
        {
          vehicle_id: p.vehicles[0].id,
          start: 32400,
          end: 36000,
          load: 40,
          stops: p.jobs.map((j, i) => ({
            job_id: j.id,
            arrival: 33000 + i * 600,
            departure: 33300 + i * 600,
          })),
        },
      ],
    });
    expect((await planRoutes(deps, request())).solver).toBe("ortools");
    const plan = (await admin.getRoutePlan(date))!;
    expect(plan.routes[0].stops.map((s) => s.pickup_id)).toEqual(ids);
  });

  it("ignores a remote answer that drops or duplicates stops", async () => {
    await book(2);
    deps.solveRemote = async (p) => ({
      status: "optimal",
      unassigned: [],
      routes: [
        {
          vehicle_id: p.vehicles[0].id,
          start: 0,
          end: 1,
          load: 1,
          stops: [{ job_id: p.jobs[0].id, arrival: 0, departure: 1 }],
        },
      ],
    });
    expect((await planRoutes(deps, request())).solver).toBe("fallback");
  });

  it("flags pickups bigger than any vehicle", async () => {
    await book(1, { books: 1500 });
    await planRoutes(deps, request());
    expect((await admin.getRoutePlan(date))!.unassigned[0].reason).toMatch(/More books/);
  });
});

describe("publishing", () => {
  it("schedules routed pickups, and a new plan replaces the old one", async () => {
    const ids = await book(3);
    await planRoutes(deps, request());
    const first = (await admin.getRoutePlan(date))!;
    await admin.publishRoutePlan(first.id);
    const statuses = async () =>
      (
        await db.query<{ status: string }>("select status from pickups order by created_at")
      ).rows.map((r) => r.status);
    expect(await statuses()).toEqual(["scheduled", "scheduled", "scheduled"]);

    // Make one pickup unroutable, re-plan and publish: it goes back to pending.
    await db.query("update pickups set geocode_status = 'needs_review' where id = $1", [ids[0]]);
    await planRoutes(deps, request());
    const second = (await admin.getRoutePlan(date))!;
    expect(second.status).toBe("draft");
    expect(second.has_published).toBe(true);
    await admin.publishRoutePlan(second.id);
    expect(await statuses()).toEqual(["pending", "scheduled", "scheduled"]);
    const { rows } = await db.query<{ status: string }>(
      "select status from route_plans order by created_at",
    );
    expect(rows.map((r) => r.status)).toEqual(["superseded", "published"]);
    await expect(admin.publishRoutePlan(second.id)).rejects.toThrow("plan_not_draft");
  });

  it("is admin-only", async () => {
    await book(1);
    await planRoutes(deps, request());
    const plan = (await admin.getRoutePlan(date))!;
    const asDriver = createAdminApi(pgRpc(db, { asUser: DRIVER }));
    await expect(asDriver.getRoutePlan(date)).rejects.toThrow();
    await expect(asDriver.publishRoutePlan(plan.id)).rejects.toThrow();
  });
});
