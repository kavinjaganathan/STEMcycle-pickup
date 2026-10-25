import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createLocalDb } from "@/lib/db/pglite";
import { createRepo, pgRpc, type Repo } from "@/lib/db/repo";
import { addDays, addDriver, asRole, openSaturday, pickupInput } from "./helpers";

let db: PGlite;
let repo: Repo;
let sat: string;

beforeEach(async () => {
  db = await createLocalDb();
  repo = createRepo(pgRpc(db));
  sat = await openSaturday(db);
});

const book = (slot_hour: number, token: string, date = sat, overrides = {}) =>
  repo.createPickup(pickupInput({ slot_date: date, slot_hour }, overrides), token, new Date());

describe("create_pickup", () => {
  it("books an hour a driver is available and estimates boxes", async () => {
    await addDriver(db, { hours: { [sat]: [10] } });
    const res = await book(10, "h1", sat, { book_count: 45 });
    expect(res).toMatchObject({ result: "ok", slot: { slot_date: sat, hour: 10 } });
    const { rows } = await db.query(
      "select status, geocode_status, est_boxes, textbook_type from pickups",
    );
    expect(rows).toEqual([
      { status: "pending", geocode_status: "pending", est_boxes: 3, textbook_type: "high_school" },
    ]);
  });

  it("marks the weekend for re-routing", async () => {
    await addDriver(db, { hours: { [addDays(sat, 1)]: [14] } });
    await book(14, "h1", addDays(sat, 1));
    const { rows } = await db.query<{ weekend_date: Date; dirty: boolean }>(
      "select weekend_date, dirty_at is not null as dirty from weekends",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].weekend_date.toISOString().slice(0, 10)).toBe(sat);
    expect(rows[0].dirty).toBe(true);
  });

  it("rejects ZIPs outside the service area", async () => {
    await addDriver(db, { hours: { [sat]: [10] } });
    expect((await book(10, "h", sat, { zip: "10001" })).result).toBe("out_of_area");
  });

  it("caps each hour at drivers x stops per driver-hour, ignoring cancellations", async () => {
    await db.exec("update settings set stops_per_driver_hour = 1");
    await addDriver(db, { hours: { [sat]: [10] } });
    expect((await book(10, "h1")).result).toBe("ok");
    expect((await book(10, "h2")).result).toBe("slot_full");
    await addDriver(db, { hours: { [sat]: [10] } });
    expect((await book(10, "h3")).result).toBe("ok");
    expect((await book(10, "h4")).result).toBe("slot_full");
    await repo.cancelPickup("h1");
    expect((await book(10, "h5")).result).toBe("ok");
  });

  it("rejects hours with no active driver, weekdays and locked weekends", async () => {
    await addDriver(db, { status: "pending", hours: { [sat]: [11] } });
    await addDriver(db, { hours: { [sat]: [12] } });
    expect((await book(11, "h1")).result).toBe("slot_unavailable");
    expect((await book(9, "h2")).result).toBe("slot_unavailable");
    expect((await book(12, "h3", addDays(sat, -1))).result).toBe("slot_unavailable"); // Friday
    await db.query("insert into weekends (weekend_date, locked_at) values ($1, now())", [sat]);
    expect((await book(12, "h4")).result).toBe("slot_unavailable");
  });

  it("closes a weekend once its Friday lock time has passed", async () => {
    await addDriver(db, { hours: { [sat]: [12] } });
    const afterLock = new Date(`${addDays(sat, -1)}T23:30:00Z`); // Fri 6:30 pm Central
    const res = await repo.createPickup(
      pickupInput({ slot_date: sat, slot_hour: 12 }),
      "h",
      afterLock,
    );
    expect(res.result).toBe("slot_unavailable");
  });
});

describe("available_slots", () => {
  it("lists weekend hours with an active driver and room left", async () => {
    await db.exec("update settings set stops_per_driver_hour = 2");
    const sun = addDays(sat, 1);
    await addDriver(db, { hours: { [sat]: [9, 10], [sun]: [13] } });
    await addDriver(db, { hours: { [sat]: [10] } });
    await addDriver(db, { status: "pending", hours: { [sat]: [15] } });
    await book(9, "a");
    await book(9, "b"); // 9 AM is now full

    const slots = await repo.listAvailableSlots(new Date());
    const mine = slots.filter((s) => s.slot_date === sat || s.slot_date === sun);
    expect(mine).toEqual([
      { slot_date: sat, hour: 10, remaining: 4 },
      { slot_date: sun, hour: 13, remaining: 2 },
    ]);
  });
});

describe("cancel_pickup", () => {
  beforeEach(async () => {
    await addDriver(db, { hours: { [sat]: [10] } });
    await book(10, "tok");
  });

  it("cancels once, then reports the existing state", async () => {
    expect(await repo.lookupCancel("tok")).toEqual({ status: "pending", slot_date: sat, hour: 10 });
    expect((await repo.cancelPickup("tok")).result).toBe("cancelled");
    expect((await repo.cancelPickup("tok")).result).toBe("already_cancelled");
    expect((await repo.cancelPickup("nope")).result).toBe("not_found");
    expect(await repo.lookupCancel("nope")).toBeNull();
  });

  it("refuses to cancel a pickup that was already collected", async () => {
    await db.query("update pickups set status = 'picked_up'");
    expect((await repo.cancelPickup("tok")).result).toBe("already_picked_up");
  });
});

describe("rate_limit_hit", () => {
  it("allows up to the max within a window", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await repo.rateLimitHit("ip:x", 600, 3));
    expect(results).toEqual([true, true, true, false]);
    expect(await repo.rateLimitHit("ip:y", 600, 3)).toBe(true);
  });
});

describe("access control", () => {
  it("hides pickups and other drivers from anon and signed-in drivers", async () => {
    const me = await addDriver(db, { hours: { [sat]: [10] } });
    const other = await addDriver(db, { hours: { [sat]: [10] } });
    await book(10, "tok");
    const count = (sql: string) =>
      db.query<{ n: number }>(sql).then((r) => r.rows[0].n);

    expect(await asRole(db, "anon", null, () => count("select count(*)::int n from pickups"))).toBe(0);
    await asRole(db, "authenticated", me, async () => {
      expect(await count("select count(*)::int n from pickups")).toBe(0);
      expect(await count("select count(*)::int n from profiles")).toBe(1);
      expect(await count("select count(*)::int n from driver_hours")).toBe(1);
      expect(
        await count(`select count(*)::int n from profiles where id = '${other}'`),
      ).toBe(0);
    });
  });

  it("keeps service-only and admin functions away from anon and drivers", async () => {
    const me = await addDriver(db);
    await asRole(db, "anon", null, async () => {
      await expect(db.query("select get_public_settings()")).rejects.toThrow(/permission denied/);
      await expect(db.query("select my_profile()")).rejects.toThrow(/permission denied/);
    });
    await asRole(db, "authenticated", me, async () => {
      await expect(db.query("select admin_get_settings()")).rejects.toThrow(/permission denied/);
      await expect(
        db.query("select admin_update_driver($1, 'active', 5)", [me]),
      ).rejects.toThrow(/permission denied/);
      const { rows } = await db.query<{ p: { status: string } }>("select my_profile() as p");
      expect(rows[0].p.status).toBe("active");
    });
  });
});
