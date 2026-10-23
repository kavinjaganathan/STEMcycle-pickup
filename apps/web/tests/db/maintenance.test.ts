import { describe, expect, it } from "vitest";
import { createLocalDb } from "@/lib/db/pglite";
import { createRepo, pgRpc } from "@/lib/db/repo";

describe("run_maintenance", () => {
  it("anonymizes pickups past the retention period and keeps recent ones", async () => {
    const db = await createLocalDb({ seed: true });
    const repo = createRepo(pgRpc(db));
    const [slot] = await repo.listAvailableSlots(new Date());
    for (const tok of ["old", "new"]) {
      await repo.createPickup(
        {
          name: "Ada",
          email: "a@b.co",
          phone: "2145550100",
          address_line: "1 Main St",
          city: "Frisco",
          zip: "75034",
          book_count: 40,
          notes: "gate",
          slot_id: slot.id,
        },
        tok,
        new Date(),
      );
    }
    // Move the "old" pickup to a slot 200 days ago (retention default is 90).
    await db.query(
      `insert into slots (id, slot_date, start_time, end_time) values ('11111111-1111-4111-8111-111111111111', current_date - 200, '09:00', '12:00')`,
    );
    await db.query(
      `update pickups set slot_id = '11111111-1111-4111-8111-111111111111', status = 'picked_up' where cancel_token_hash = 'old'`,
    );
    await db.query(
      `insert into rate_limits (key, window_start, count) values ('k', now() - interval '3 days', 1)`,
    );

    expect(await repo.runMaintenance()).toEqual({ anonymized: 1, plans_removed: 0 });
    const { rows } = await db.query<Record<string, unknown>>(
      "select name, email, phone, address_line, notes, city, book_count, anonymized_at is not null as anon from pickups order by anonymized_at nulls last",
    );
    expect(rows[0]).toEqual({
      name: "Removed",
      email: "",
      phone: "",
      address_line: "",
      notes: null,
      city: "Frisco",
      book_count: 40,
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
