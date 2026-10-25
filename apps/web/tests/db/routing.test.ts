import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createAdminApi } from "@/lib/db/admin";
import { createLocalDb } from "@/lib/db/pglite";
import { createRepo, pgRpc, type Repo } from "@/lib/db/repo";
import { createRoutingApi } from "@/lib/db/routing";
import type { EmailMessage } from "@/lib/email";
import { fakeMatrix } from "@/lib/routing/matrix";
import { REASONS } from "@/lib/routing/plan";
import { runRoutingTick, runWeekendNow, type SchedulerDeps } from "@/lib/routing/scheduler";
import { addDays, addDriver, openSaturday, pickupInput } from "./helpers";

let db: PGlite;
let repo: Repo;
let sat: string;
let sent: EmailMessage[];
let seq = 0;

const MIN = 60_000;

beforeEach(async () => {
  db = await createLocalDb({ seed: false });
  await db.exec(
    "update settings set depot_lat = 33.1497, depot_lng = -96.8226, depot_name = 'Depot', stops_per_driver_hour = 10",
  );
  repo = createRepo(pgRpc(db));
  sat = await openSaturday(db);
  sent = [];
});

function deps(now: Date): SchedulerDeps {
  return {
    routing: createRoutingApi(pgRpc(db)),
    buildMatrix: async (pts) => fakeMatrix(pts),
    solveRemote: async () => null,
    routeLine: async (pts) => pts.map((p) => [p.lat, p.lng]),
    sendEmail: async (m) => {
      sent.push(m);
    },
    settings: () => repo.getPublicSettings(),
    appUrl: "https://pickup.example.org",
    now: () => now,
  };
}

const later = (minutes: number) => new Date(Date.now() + minutes * MIN);

/** Books a pickup and gives it a location near Frisco (as geocoding would). */
async function book(
  hour: number,
  opts: { date?: string; books?: number; located?: boolean; name?: string } = {},
) {
  const token = `t${++seq}`;
  const res = await repo.createPickup(
    pickupInput(
      { slot_date: opts.date ?? sat, slot_hour: hour },
      { book_count: opts.books ?? 20, name: opts.name ?? `Resident ${seq}` },
    ),
    token,
    new Date(),
  );
  if (res.result !== "ok") throw new Error(`booking failed: ${res.result}`);
  if (opts.located !== false) {
    await db.query("update pickups set lat = $2, lng = $3, geocode_status = 'ok' where id = $1", [
      res.pickup_id,
      33.1 + (seq % 7) * 0.01,
      -96.8 + (seq % 5) * 0.01,
    ]);
  } else {
    await db.query("update pickups set geocode_status = 'failed' where id = $1", [res.pickup_id]);
  }
  return res.pickup_id;
}

type StopRow = { pickup_id: string; driver_id: string; slot_hour: number; eta: string };
async function stops(): Promise<StopRow[]> {
  const { rows } = await db.query<StopRow>(
    `select st.pickup_id, r.driver_id, pk.slot_hour, st.eta::text as eta
     from route_stops st join routes r on r.id = st.route_id
     join route_plans rp on rp.id = r.plan_id and rp.status = 'published'
     join pickups pk on pk.id = st.pickup_id`,
  );
  return rows;
}

const issue = async (id: string) =>
  (
    await db.query<{ status: string; route_issue: string | null }>(
      "select status, route_issue from pickups where id = $1",
      [id],
    )
  ).rows[0];

describe("automatic routing", () => {
  it("waits for changes to go quiet, then plans once using only drivers' hours", async () => {
    const dana = await addDriver(db, {
      name: "Dana",
      capacity: 12,
      hours: { [sat]: [9, 10, 11, 12] },
    });
    const sam = await addDriver(db, {
      name: "Sam",
      capacity: 8,
      hours: { [sat]: [10, 11, 12, 13] },
    });
    const ids = [await book(9), await book(10), await book(11), await book(12), await book(13)];

    // A burst of bookings: nothing runs while changes are still coming in.
    expect(await runRoutingTick(deps(new Date()))).toEqual([]);
    // Two quiet minutes later: exactly one run for the weekend.
    expect(await runRoutingTick(deps(later(3)))).toEqual([
      { weekend: sat, final: false, status: "ok" },
    ]);
    expect(await runRoutingTick(deps(later(4)))).toEqual([]);

    const hoursOf: Record<string, number[]> = { [dana]: [9, 10, 11, 12], [sam]: [10, 11, 12, 13] };
    const routed = await stops();
    expect(routed.map((s) => s.pickup_id).sort()).toEqual([...ids].sort());
    for (const s of routed) {
      // Every stop is with a driver who's free that hour, inside the 1-hour slot.
      expect(hoursOf[s.driver_id]).toContain(s.slot_hour);
      const [h, m] = s.eta.split(":").map(Number);
      expect(h * 60 + m).toBeGreaterThanOrEqual(s.slot_hour * 60);
      expect(h * 60 + m).toBeLessThanOrEqual((s.slot_hour + 1) * 60);
    }
    // The 9 AM and 1 PM stops can only go to Dana and Sam respectively.
    expect(routed.find((s) => s.slot_hour === 9)?.driver_id).toBe(dana);
    expect(routed.find((s) => s.slot_hour === 13)?.driver_id).toBe(sam);
    for (const id of ids)
      expect(await issue(id)).toEqual({ status: "scheduled", route_issue: null });
  });

  it("flags pickups no driver can cover, with a reason", async () => {
    const dana = await addDriver(db, { name: "Dana", capacity: 5, hours: { [sat]: [10, 14] } });
    const lost = await book(10, { located: false });
    const huge = await book(10, { books: 300 }); // 15 boxes > 5
    const orphan = await book(14);
    const ok = await book(10);
    // Dana drops her 2 PM hour after someone booked it.
    await pgRpc(db, { asUser: dana })("driver_set_availability", { p_date: sat, p_hours: [10] });

    await runRoutingTick(deps(later(3)));
    expect(await issue(lost)).toEqual({ status: "pending", route_issue: REASONS.location });
    expect(await issue(huge)).toEqual({ status: "pending", route_issue: REASONS.tooBig });
    expect(await issue(orphan)).toEqual({ status: "pending", route_issue: REASONS.noDriver });
    expect(await issue(ok)).toEqual({ status: "scheduled", route_issue: null });

    const w = await createRoutingApi(pgRpc(db)).weekend(sat);
    expect(w.days[0].unassigned.map((u) => u.pickup_id).sort()).toEqual(
      [lost, huge, orphan].sort(),
    );
    expect(w.days[0].plan?.routes).toHaveLength(1);
  });

  it("respects vehicle capacity across stops", async () => {
    await addDriver(db, { name: "Dana", capacity: 3, hours: { [sat]: [10, 11] } });
    const a = await book(10, { books: 40 }); // 2 boxes
    const b = await book(11, { books: 40 }); // 2 boxes: together over 3
    await runRoutingTick(deps(later(3)));
    const statuses = [(await issue(a)).status, (await issue(b)).status].sort();
    expect(statuses).toEqual(["pending", "scheduled"]);
  });

  it("keeps admin assignments through later re-runs", async () => {
    await addDriver(db, { name: "Dana", hours: { [sat]: [10, 11] } });
    const sam = await addDriver(db, { name: "Sam", hours: { [sat]: [10, 11] } });
    const p = await book(10);
    await createAdminApi(pgRpc(db)).pinPickup(p, sam);
    await runWeekendNow(deps(new Date()), sat);
    expect((await stops()).find((s) => s.pickup_id === p)?.driver_id).toBe(sam);

    // More bookings trigger an automatic re-run; the assignment stays.
    await book(10);
    await book(11);
    await runRoutingTick(deps(later(3)));
    expect((await stops()).find((s) => s.pickup_id === p)?.driver_id).toBe(sam);
    expect(await stops()).toHaveLength(3);
  });

  it("locks the weekend on Friday evening and emails each driver their route", async () => {
    const dana = await addDriver(db, { name: "Dana", hours: { [sat]: [10] } });
    await addDriver(db, { name: "Idle", hours: { [addDays(sat, 1)]: [15] } });
    await book(10);
    const { rows } = await db.query<{ t: Date }>("select weekend_lock_at($1) as t", [sat]);
    const afterLock = new Date(rows[0].t.getTime() + MIN);

    expect(await runRoutingTick(deps(afterLock))).toEqual([
      { weekend: sat, final: true, status: "ok" },
    ]);
    const w = await createRoutingApi(pgRpc(db)).weekend(sat);
    expect(w.locked_at).not.toBeNull();
    // Only drivers with stops are emailed.
    expect(sent.map((m) => m.subject)).toEqual([
      expect.stringContaining("Your StemCycle route for the weekend of"),
    ]);
    expect(sent[0].text).toContain(`https://pickup.example.org/driver?weekend=${sat}`);

    // Locked: no more bookings or availability changes for that weekend.
    const slots = await repo.listAvailableSlots(new Date());
    expect(slots.some((s) => s.slot_date === sat)).toBe(false);
    await expect(
      pgRpc(db, { asUser: dana })("driver_set_availability", { p_date: sat, p_hours: [11] }),
    ).rejects.toThrow("availability_locked");
    // Later ticks leave it alone.
    expect(await runRoutingTick(deps(new Date(afterLock.getTime() + 10 * MIN)))).toEqual([]);
  });

  it("emails drivers whose locked route the admin changed", async () => {
    const dana = await addDriver(db, { name: "Dana", hours: { [sat]: [10] } });
    const sam = await addDriver(db, { name: "Sam", hours: { [sat]: [10] } });
    const p = await book(10);
    await createAdminApi(pgRpc(db)).pinPickup(p, dana);
    await runWeekendNow(deps(new Date()), sat);
    await db.query("update weekends set locked_at = now() where weekend_date = $1", [sat]);
    sent = [];

    await createAdminApi(pgRpc(db)).pinPickup(p, sam);
    await runWeekendNow(deps(new Date()), sat);
    expect(sent.map((m) => m.to).sort()).toHaveLength(2); // Dana lost it, Sam gained it
    expect(sent.every((m) => m.subject.includes("route changed"))).toBe(true);
  });

  it("plans nothing without a depot and says why", async () => {
    await db.exec("update settings set depot_lat = null, depot_lng = null");
    await addDriver(db, { hours: { [sat]: [10] } });
    const p = await book(10);
    await runRoutingTick(deps(later(3)));
    expect(await issue(p)).toEqual({ status: "pending", route_issue: REASONS.noDepot });
  });
});

describe("driver route view", () => {
  it("shows drivers only their own stops, without resident emails", async () => {
    const dana = await addDriver(db, { name: "Dana", hours: { [sat]: [10] } });
    const sam = await addDriver(db, { name: "Sam", hours: { [sat]: [10] } });
    const a = await book(10, { name: "For Dana" });
    const b = await book(10, { name: "For Sam" });
    const admin = createAdminApi(pgRpc(db));
    await admin.pinPickup(a, dana);
    await admin.pinPickup(b, sam);
    await runWeekendNow(deps(new Date()), sat);

    const view = (await pgRpc(db, { asUser: dana })("driver_routes", { p_weekend: sat })) as {
      days: { date: string; routes: { stops: Record<string, unknown>[] }[]; hours: number[] }[];
    };
    const mine = view.days.flatMap((d) => d.routes.flatMap((r) => r.stops));
    expect(mine.map((s) => s.name)).toEqual(["For Dana"]);
    expect(mine[0]).not.toHaveProperty("email");
    expect(view.days[0].hours).toEqual([10]);

    // Dana can mark her stop picked up, but not Sam's.
    const { rows } = await db.query<{ id: string; pickup_id: string }>(
      "select id, pickup_id from route_stops",
    );
    const samStop = rows.find((r) => r.pickup_id === b)!.id;
    const danaStop = rows.find((r) => r.pickup_id === a)!.id;
    const asDana = pgRpc(db, { asUser: dana });
    await expect(
      asDana("driver_set_stop_status", { p_stop_id: samStop, p_picked_up: true }),
    ).rejects.toThrow("stop_not_yours");
    expect(
      await asDana("driver_set_stop_status", { p_stop_id: danaStop, p_picked_up: true }),
    ).toEqual({ ok: true, status: "picked_up" });

    // Disabled drivers lose access.
    await admin.updateDriver(dana, "disabled", 10);
    await expect(asDana("driver_routes", { p_weekend: sat })).rejects.toThrow();
  });
});

describe("routing_work_due", () => {
  it("is true only when a weekend has settled changes or is due to lock", async () => {
    const due = async (quiet: number) =>
      (await db.query<{ d: boolean }>("select routing_work_due($1) as d", [quiet])).rows[0].d;
    expect(await due(0)).toBe(false);
    await addDriver(db, { hours: { [sat]: [10] } });
    await book(10);
    expect(await due(120)).toBe(false); // still settling
    expect(await due(0)).toBe(true);
    await runRoutingTick(deps(later(3)));
    expect(await due(0)).toBe(false);
  });
});
