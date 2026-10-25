import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createAdminApi } from "@/lib/db/admin";
import { createLocalDb } from "@/lib/db/pglite";
import { createRepo, pgRpc } from "@/lib/db/repo";
import { addDays, addDriver, openSaturday, pickupInput } from "./helpers";

let db: PGlite;
let sat: string;
const admin = () => createAdminApi(pgRpc(db));

beforeEach(async () => {
  db = await createLocalDb();
  sat = await openSaturday(db);
});

describe("admin pickups", () => {
  it("lists pickups in a date range with routing details, and changes status", async () => {
    await addDriver(db, { hours: { [sat]: [10] } });
    const repo = createRepo(pgRpc(db));
    await repo.createPickup(pickupInput({ slot_date: sat, slot_hour: 10 }), "a", new Date());
    await repo.createPickup(
      pickupInput({ slot_date: sat, slot_hour: 10 }, { name: "Other" }),
      "b",
      new Date(),
    );
    const list = await admin().listPickups(sat, addDays(sat, 1), null);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      slot_date: sat,
      slot_hour: 10,
      textbook_type: "high_school",
      est_boxes: 1,
      driver_name: null,
    });

    await db.exec("update weekends set dirty_at = null");
    await admin().setPickupStatus(list[0].id, "cancelled");
    expect(await admin().listPickups(sat, sat, ["pending"])).toHaveLength(1);
    const { rows } = await db.query("select dirty_at is not null as dirty from weekends");
    expect(rows).toEqual([{ dirty: true }]);
  });
});

describe("admin drivers", () => {
  it("approves a pending driver, reports the previous status and re-plans", async () => {
    const id = await addDriver(db, { status: "pending", name: "Pat", hours: { [sat]: [11] } });
    const before = await admin().listDrivers();
    expect(before.find((d) => d.id === id)).toMatchObject({
      status: "pending",
      availability: [{ date: sat, hours: [11] }],
    });
    const res = await admin().updateDriver(id, "active", 12);
    expect(res).toMatchObject({ previous_status: "pending", full_name: "Pat" });
    expect(res.email).toContain("@test.local");
    const slots = await createRepo(pgRpc(db)).listAvailableSlots(new Date());
    expect(slots.some((s) => s.slot_date === sat && s.hour === 11)).toBe(true);
  });
});

describe("admin settings", () => {
  it("round-trips settings including the depot", async () => {
    const s = await admin().getSettings();
    await admin().updateSettings({
      ...s,
      depot_name: "Garage",
      depot_address: "1 Depot Way, Frisco, TX",
      depot_lat: 33.1,
      depot_lng: -96.8,
      books_per_box: 25,
    });
    expect(await admin().getSettings()).toMatchObject({
      depot_name: "Garage",
      depot_lat: 33.1,
      books_per_box: 25,
    });
  });
});
