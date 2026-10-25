import { describe, expect, it } from "vitest";
import { createLocalDb } from "@/lib/db/pglite";
import { createRepo, pgRpc } from "@/lib/db/repo";
import { addDriver, openSaturday, pickupInput } from "./helpers";

describe("run_maintenance", () => {
  it("anonymizes pickups past the retention period and keeps recent ones", async () => {
    const db = await createLocalDb();
    const repo = createRepo(pgRpc(db));
    const sat = await openSaturday(db);
    await addDriver(db, { hours: { [sat]: [10] } });
    for (const tok of ["old", "new"]) {
      await repo.createPickup(
        pickupInput(
          { slot_date: sat, slot_hour: 10 },
          { name: "Ada", zip: "75034", book_count: 40, notes: "gate" },
        ),
        tok,
        new Date(),
      );
    }
    // Move the "old" pickup to a Saturday ~200 days ago (retention default is 90).
    await db.query(
      `update pickups set slot_date = $1::date - 203, status = 'picked_up' where cancel_token_hash = 'old'`,
      [sat],
    );
    await db.query(
      `insert into rate_limits (key, window_start, count) values ('k', now() - interval '3 days', 1)`,
    );

    expect(await repo.runMaintenance()).toEqual({ anonymized: 1, plans_removed: 0 });
    const { rows } = await db.query<Record<string, unknown>>(
      "select name, email, phone, address_line, notes, city, book_count, textbook_type, anonymized_at is not null as anon from pickups order by anonymized_at nulls last",
    );
    expect(rows[0]).toEqual({
      name: "Removed",
      email: "",
      phone: "",
      address_line: "",
      notes: null,
      city: "Frisco",
      book_count: 40,
      textbook_type: "high_school",
      anon: true,
    });
    expect(rows[1]).toMatchObject({ name: "Ada", anon: false });
    expect((await db.query("select * from rate_limits where key = 'k'")).rows).toEqual([]);
    // The old cancel link no longer works.
    expect(await repo.lookupCancel("old")).toBeNull();
    // Idempotent.
    expect((await repo.runMaintenance()).anonymized).toBe(0);
    expect(await repo.healthCheck()).toBe(true);
  });
});
