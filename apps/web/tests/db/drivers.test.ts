import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createLocalDb } from "@/lib/db/pglite";
import { createDriverApi } from "@/lib/db/driver";
import { createRepo, pgRpc } from "@/lib/db/repo";
import { addDays, addDriver, openSaturday, pickupInput } from "./helpers";

let db: PGlite;
let sat: string;

beforeEach(async () => {
  db = await createLocalDb();
  sat = await openSaturday(db);
});

const asDriver = (id: string) => createDriverApi(pgRpc(db, { asUser: id }));

describe("driver availability", () => {
  it("lists every open weekend day and replaces a day's hours", async () => {
    const id = await addDriver(db);
    const api = asDriver(id);
    const before = await api.availability();
    expect(before).toMatchObject({ timezone: "America/Chicago" });
    expect(before.days.length).toBe(8); // 4 weekends x Sat/Sun
    // Each day lists the set pickup times (Sat 10 and 11, Sun 1 and 2 PM by default).
    expect(before.days[0]).toMatchObject({
      date: sat,
      hours: [],
      slots: [
        { hour: 10, booked: 0, drivers: 0 },
        { hour: 11, booked: 0, drivers: 0 },
      ],
    });
    expect(before.days[1].slots.map((s) => s.hour)).toEqual([13, 14]);

    await api.setAvailability(sat, [11, 10, 11]);
    await api.setAvailability(sat, [11]);
    await createRepo(pgRpc(db)).createPickup(
      pickupInput({ slot_date: sat, slot_hour: 10 }),
      "t1",
      new Date(),
    );
    const after = await api.availability();
    const day = after.days.find((d) => d.date === sat)!;
    expect(day.hours).toEqual([11]);
    // Drivers see where bookings are and which times still need someone.
    expect(day.slots).toEqual([
      { hour: 10, booked: 1, drivers: 0 },
      { hour: 11, booked: 0, drivers: 1 },
    ]);

    const { rows } = await db.query<{ dirty: boolean }>(
      "select dirty_at is not null as dirty from weekends where weekend_date = $1",
      [sat],
    );
    expect(rows).toEqual([{ dirty: true }]);
  });

  it("rejects hours that aren't pickup times, locked weekends and weekdays", async () => {
    const api = asDriver(await addDriver(db));
    await expect(api.setAvailability(sat, [7])).rejects.toThrow("hours_out_of_range");
    await expect(api.setAvailability(sat, [10, 12])).rejects.toThrow("hours_out_of_range");
    await expect(api.setAvailability(addDays(sat, -1), [10])).rejects.toThrow(
      "availability_locked",
    );
    await db.query("insert into weekends (weekend_date, locked_at) values ($1, now())", [sat]);
    await expect(api.setAvailability(addDays(sat, 1), [10])).rejects.toThrow("availability_locked");
  });

  it("is only for active drivers, and only their own hours", async () => {
    const pending = asDriver(await addDriver(db, { status: "pending" }));
    await expect(pending.setAvailability(sat, [10])).rejects.toThrow();
    const a = await addDriver(db, { hours: { [sat]: [9] } });
    const b = await addDriver(db, { hours: { [sat]: [15] } });
    expect((await asDriver(a).availability()).days[0].hours).toEqual([9]);
    expect((await asDriver(b).availability()).days[0].hours).toEqual([15]);
  });

  it("re-plans upcoming weekends when a driver's capacity changes", async () => {
    const id = await addDriver(db, { hours: { [sat]: [10] } });
    await pgRpc(db, { asUser: id })("driver_update_profile", {
      p_full_name: "Dana",
      p_phone: "2145550100",
      p_capacity: 25,
    });
    const { rows } = await db.query(
      "select count(*)::int n from weekends where dirty_at is not null",
    );
    expect(rows).toEqual([{ n: 1 }]);
  });
});
