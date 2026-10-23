import "server-only";

/**
 * Typed wrappers around the SQL functions in supabase/migrations. The same
 * functions run on Supabase (production) and PGlite (local dev + tests), so
 * the only thing that differs per backend is how a function is called.
 */
export type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<unknown>;

export type PublicSettings = {
  org_name: string;
  timezone: string;
  zip_allowlist: string[];
  booking_cutoff_hours: number;
  email_display_name: string;
  reply_to: string | null;
};

export type SlotWindow = {
  slot_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  end_time: string;
};

export type AvailableSlot = SlotWindow & { id: string; remaining: number | null };

export type NewPickup = {
  name: string;
  email: string;
  phone: string;
  address_line: string;
  city: string;
  zip: string;
  book_count: number;
  notes: string | null;
  slot_id: string;
};

export type CreatePickupResult =
  | { result: "ok"; pickup_id: string; slot: SlotWindow }
  | { result: "out_of_area" | "slot_unavailable" | "slot_full" };

export type CancelLookup = SlotWindow & {
  status: "pending" | "scheduled" | "picked_up" | "cancelled";
};

export type CancelResult = {
  result: "cancelled" | "not_found" | "already_cancelled" | "already_picked_up";
};

export function createRepo(rpc: Rpc) {
  return {
    getPublicSettings: async () => (await rpc("get_public_settings")) as PublicSettings,

    listAvailableSlots: async (now: Date) =>
      (await rpc("available_slots", { p_now: now.toISOString() })) as AvailableSlot[],

    createPickup: async (p: NewPickup, cancelTokenHash: string, now: Date) =>
      (await rpc("create_pickup", {
        p_name: p.name,
        p_email: p.email,
        p_phone: p.phone,
        p_address_line: p.address_line,
        p_city: p.city,
        p_zip: p.zip,
        p_book_count: p.book_count,
        p_notes: p.notes,
        p_slot_id: p.slot_id,
        p_cancel_token_hash: cancelTokenHash,
        p_now: now.toISOString(),
      })) as CreatePickupResult,

    lookupCancel: async (tokenHash: string) =>
      ((await rpc("lookup_cancel", { p_token_hash: tokenHash })) ?? null) as CancelLookup | null,

    cancelPickup: async (tokenHash: string) =>
      (await rpc("cancel_pickup", { p_token_hash: tokenHash })) as CancelResult,

    rateLimitHit: async (key: string, windowSeconds: number, max: number) =>
      (await rpc("rate_limit_hit", {
        p_key: key,
        p_window_seconds: windowSeconds,
        p_max: max,
      })) as boolean,
  };
}

export type Repo = ReturnType<typeof createRepo>;

/** Calls `select fn(arg => $1, ...)` on a PGlite (or any pg-compatible) client. */
export function pgRpc(db: {
  query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
}): Rpc {
  return async (fn, args = {}) => {
    if (!/^[a-z_]+$/.test(fn)) throw new Error("invalid function name");
    const keys = Object.keys(args);
    for (const k of keys) if (!/^p_[a-z_]+$/.test(k)) throw new Error("invalid argument name");
    const sql = `select ${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
    const res = await db.query<{ r: unknown }>(
      sql,
      keys.map((k) => args[k]),
    );
    return res.rows[0]?.r ?? null;
  };
}
