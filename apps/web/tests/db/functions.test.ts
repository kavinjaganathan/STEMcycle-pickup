import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createLocalDb } from "@/lib/db/pglite";
import { createRepo, pgRpc, type NewPickup, type Repo } from "@/lib/db/repo";

let db: PGlite;
let repo: Repo;

async function addSlot(
  opts: { daysAhead?: number; capacity?: number | null; active?: boolean } = {},
) {
  const { rows } = await db.query<{ id: string }>(
    `insert into slots (slot_date, start_time, end_time, capacity, active)
     values (current_date + $1::int, '09:00', '12:00', $2, $3) returning id`,
    [opts.daysAhead ?? 3, opts.capacity === undefined ? 10 : opts.capacity, opts.active ?? true],
  );
  return rows[0].id;
}

function pickup(slotId: string, overrides: Partial<NewPickup> = {}): NewPickup {
  return {
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "2145550100",
    address_line: "1 Main St",
    city: "Frisco",
    zip: "75033",
    book_count: 20,
    notes: null,
    slot_id: slotId,
    ...overrides,
  };
}

beforeEach(async () => {
  db = await createLocalDb();
  repo = createRepo(pgRpc(db));
});

describe("create_pickup", () => {
  it("creates a pending pickup and returns its slot window", async () => {
    const slot = await addSlot();
    const res = await repo.createPickup(pickup(slot), "hash-1", new Date());
    expect(res.result).toBe("ok");
    const { rows } = await db.query<{ status: string; geocode_status: string }>(
      "select status, geocode_status from pickups",
    );
    expect(rows).toEqual([{ status: "pending", geocode_status: "pending" }]);
  });

  it("rejects ZIPs outside the service area", async () => {
    const slot = await addSlot();
    const res = await repo.createPickup(pickup(slot, { zip: "10001" }), "h", new Date());
    expect(res.result).toBe("out_of_area");
  });

  it("enforces slot capacity, ignoring cancelled pickups", async () => {
    const slot = await addSlot({ capacity: 1 });
    expect((await repo.createPickup(pickup(slot), "h1", new Date())).result).toBe("ok");
    expect((await repo.createPickup(pickup(slot), "h2", new Date())).result).toBe("slot_full");
    await repo.cancelPickup("h1");
    expect((await repo.createPickup(pickup(slot), "h3", new Date())).result).toBe("ok");
  });

  it("rejects inactive slots and slots inside the booking cutoff", async () => {
    const inactive = await addSlot({ active: false });
    const today = await addSlot({ daysAhead: 0 });
    expect((await repo.createPickup(pickup(inactive), "h1", new Date())).result).toBe(
      "slot_unavailable",
    );
    expect((await repo.createPickup(pickup(today), "h2", new Date())).result).toBe(
      "slot_unavailable",
    );
  });
});

describe("available_slots", () => {
  it("lists only bookable slots with remaining capacity", async () => {
    const open = await addSlot({ capacity: 2 });
    const full = await addSlot({ capacity: 1 });
    const unlimited = await addSlot({ capacity: null });
    await addSlot({ active: false });
    await addSlot({ daysAhead: -1 });
    await repo.createPickup(pickup(full), "h1", new Date());

    const slots = await repo.listAvailableSlots(new Date());
    const byId = new Map(slots.map((s) => [s.id, s]));
    expect([...byId.keys()].sort()).toEqual([open, unlimited].sort());
    expect(byId.get(open)?.remaining).toBe(2);
    expect(byId.get(unlimited)?.remaining).toBeNull();
  });
});

describe("cancel_pickup", () => {
  it("cancels once, then reports the existing state", async () => {
    const slot = await addSlot();
    await repo.createPickup(pickup(slot), "tok", new Date());
    expect((await repo.lookupCancel("tok"))?.status).toBe("pending");
    expect((await repo.cancelPickup("tok")).result).toBe("cancelled");
    expect((await repo.cancelPickup("tok")).result).toBe("already_cancelled");
    expect((await repo.cancelPickup("nope")).result).toBe("not_found");
    expect(await repo.lookupCancel("nope")).toBeNull();
  });

  it("refuses to cancel a pickup that was already collected", async () => {
    const slot = await addSlot();
    await repo.createPickup(pickup(slot), "tok", new Date());
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

describe("row level security", () => {
  it("hides pickups from anonymous and non-admin users", async () => {
    const slot = await addSlot();
    await repo.createPickup(pickup(slot), "tok", new Date());
    const { rows: users } = await db.query<{ id: string }>(
      "insert into auth.users (email) values ('d@x.org'), ('a@x.org') returning id",
    );
    await db.query("insert into profiles (id, role) values ($1, 'driver'), ($2, 'admin')", [
      users[0].id,
      users[1].id,
    ]);

    const countAs = async (role: string, sub: string | null) => {
      await db.exec(`set role ${role}`);
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [sub ?? ""]);
      const { rows } = await db.query<{ n: number }>("select count(*)::int as n from pickups");
      await db.exec("reset role");
      return rows[0].n;
    };

    expect(await countAs("anon", null)).toBe(0);
    expect(await countAs("authenticated", users[0].id)).toBe(0);
    expect(await countAs("authenticated", users[1].id)).toBe(1);
  });

  it("does not let anon call the service-only functions", async () => {
    await db.exec("set role anon");
    await expect(db.query("select get_public_settings()")).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  });
});
