import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createLocalDb } from "@/lib/db/pglite";
import { createAdminApi } from "@/lib/db/admin";
import { createDriverApi } from "@/lib/db/driver";
import { createRepo, pgRpc } from "@/lib/db/repo";
import { fakeMatrix } from "@/lib/routing/matrix";
import { planRoutes } from "@/lib/routing/plan";

const ADMIN = "00000000-0000-4000-8000-000000000001";
const DANA = "00000000-0000-4000-8000-000000000002";
const SAM = "00000000-0000-4000-8000-000000000003";

let db: PGlite;
let date: string;
let planId: string;

const asDriver = (id: string) => createDriverApi(pgRpc(db, { asUser: id }));

beforeEach(async () => {
  db = await createLocalDb({ seed: true });
  const admin = createAdminApi(pgRpc(db, { asUser: ADMIN }));
  const repo = createRepo(pgRpc(db));
  const [slot] = await repo.listAvailableSlots(new Date());
  date = slot.slot_date;
  // Two far-apart clusters with big loads so both SUVs are needed.
  for (let i = 0; i < 6; i++) {
    const r = await repo.createPickup(
      {
        name: `R${i}`,
        email: `r${i}@x.org`,
        phone: "2145550100",
        address_line: `${i} Main St`,
        city: "Frisco",
        zip: "75034",
        book_count: 120,
        notes: "Side door",
        slot_id: slot.id,
      },
      `t${i}`,
      new Date(),
    );
    if (r.result !== "ok") throw new Error(r.result);
    await db.query("update pickups set geocode_status='ok', lat=$2, lng=$3 where id=$1", [
      r.pickup_id,
      33.0 + (i % 2) * 0.3,
      -96.8 + i * 0.002,
    ]);
  }
  const depot = (await admin.listDepots())[0].id;
  const vehicles = await admin.listVehicles();
  await planRoutes(
    {
      admin,
      buildMatrix: async (p) => fakeMatrix(p),
      solveRemote: async () => null,
      routeLine: async () => [],
    },
    {
      date,
      start_depot_id: depot,
      end_depot_id: depot,
      start_time: "08:00",
      vehicles: [
        { vehicle_id: vehicles[0].id, driver_id: DANA },
        { vehicle_id: vehicles[1].id, driver_id: SAM },
      ],
    },
  );
  planId = (await admin.getRoutePlan(date))!.id;
});

const publish = () => createAdminApi(pgRpc(db, { asUser: ADMIN })).publishRoutePlan(planId);

describe("driver access", () => {
  it("sees nothing until the plan is published", async () => {
    expect(await asDriver(DANA).routes(date)).toEqual([]);
  });

  it("sees only their own route, without resident emails", async () => {
    await publish();
    const dana = await asDriver(DANA).routes(date);
    const sam = await asDriver(SAM).routes(date);
    expect(dana).toHaveLength(1);
    expect(sam).toHaveLength(1);
    const danaStops = dana[0].stops.map((s) => s.id);
    expect(danaStops.some((id) => sam[0].stops.some((s) => s.id === id))).toBe(false);
    expect(Object.keys(dana[0].stops[0])).not.toContain("email");
    expect(dana[0].stops[0].notes).toBe("Side door");
  });

  it("RLS hides other drivers' rows even with direct table access", async () => {
    await publish();
    const countAs = async (uid: string, sql: string) =>
      db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
        await tx.exec("set local role authenticated");
        return (await tx.query<{ n: number }>(sql)).rows[0].n;
      });
    const danaPickups = await countAs(DANA, "select count(*)::int as n from pickups");
    const samPickups = await countAs(SAM, "select count(*)::int as n from pickups");
    expect(danaPickups + samPickups).toBe(6);
    expect(danaPickups).toBeGreaterThan(0);
    expect(await countAs(DANA, "select count(*)::int as n from routes")).toBe(1);
    expect(await countAs(DANA, "select count(*)::int as n from vehicles")).toBe(0);
    expect(await countAs(DANA, "select count(*)::int as n from profiles")).toBe(1); // only self
  });

  it("marks own stops picked up and can undo, but not other drivers' stops", async () => {
    await publish();
    const [danaRoute] = await asDriver(DANA).routes(date);
    const [samRoute] = await asDriver(SAM).routes(date);
    const stop = danaRoute.stops[0];

    expect((await asDriver(DANA).setStopStatus(stop.id, true)).status).toBe("picked_up");
    expect((await asDriver(DANA).routes(date))[0].stops[0].status).toBe("picked_up");
    expect((await asDriver(DANA).setStopStatus(stop.id, false)).status).toBe("scheduled");

    await expect(asDriver(DANA).setStopStatus(samRoute.stops[0].id, true)).rejects.toThrow(
      "stop_not_yours",
    );
    await expect(asDriver(SAM).setStopStatus(stop.id, true)).rejects.toThrow("stop_not_yours");
  });

  it("can't mark a stop the resident cancelled, and loses access when deactivated", async () => {
    await publish();
    const [route] = await asDriver(DANA).routes(date);
    await db.query(
      "update pickups set status='cancelled' where id = (select pickup_id from route_stops where id=$1)",
      [route.stops[0].id],
    );
    await expect(asDriver(DANA).setStopStatus(route.stops[0].id, true)).rejects.toThrow(
      "pickup_cancelled",
    );
    await db.query("update profiles set active=false where id=$1", [DANA]);
    expect(await asDriver(DANA).routes(date)).toEqual([]);
  });
});
