import type { PGlite } from "@electric-sql/pglite";
import type { NewPickup } from "@/lib/db/repo";

/** First Saturday still open for booking (its lock time hasn't passed). */
export async function openSaturday(db: PGlite, nth = 0): Promise<string> {
  const { rows } = await db.query<{ d: string }>(
    `select to_char(d, 'YYYY-MM-DD') as d from open_weekend_dates() d
     where extract(isodow from d) = 6 order by d offset $1 limit 1`,
    [nth],
  );
  return rows[0].d;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

let seq = 0;

/** Creates a driver (active by default) with hours on the given dates. */
export async function addDriver(
  db: PGlite,
  opts: {
    name?: string;
    capacity?: number;
    status?: "pending" | "active" | "disabled";
    hours?: Record<string, number[]>;
  } = {},
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [`driver${++seq}-${Date.now()}@test.local`],
  );
  const id = rows[0].id;
  await db.query(
    "update profiles set full_name = $2, capacity_boxes = $3, status = $4, phone = '2145550199' where id = $1",
    [id, opts.name ?? `Driver ${seq}`, opts.capacity ?? 10, opts.status ?? "active"],
  );
  for (const [date, hours] of Object.entries(opts.hours ?? {})) {
    for (const h of hours) {
      await db.query("insert into driver_hours (driver_id, avail_date, hour) values ($1, $2, $3)", [
        id,
        date,
        h,
      ]);
    }
  }
  return id;
}

export function pickupInput(
  slot: { slot_date: string; slot_hour: number },
  overrides: Partial<NewPickup> = {},
): NewPickup {
  return {
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "2145550100",
    address_line: "1 Main St",
    city: "Frisco",
    zip: "75033",
    textbook_type: "high_school",
    book_count: 20,
    notes: null,
    ...slot,
    ...overrides,
  };
}

/** Runs a query as a Supabase role (and user), like PostgREST would. */
export async function asRole<T>(
  db: PGlite,
  role: "anon" | "authenticated",
  sub: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [sub ?? ""]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}
