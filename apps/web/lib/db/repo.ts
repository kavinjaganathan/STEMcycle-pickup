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

export type PickupAddress = { id: string; address_line: string; city: string; zip: string };
export type GeoPoint = { lat: number; lng: number; quality: "exact" | "approximate" };

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

export function createGeocodeRepo(rpc: Rpc) {
  return {
    reserve: async (intervalMs: number) =>
      (await rpc("geocode_reserve", { p_interval_ms: intervalMs })) as number,
    cacheGet: async (hash: string) =>
      ((await rpc("geocode_cache_get", { p_hash: hash })) ?? null) as GeoPoint | null,
    cachePut: async (hash: string, p: GeoPoint) => {
      await rpc("geocode_cache_put", {
        p_hash: hash,
        p_lat: p.lat,
        p_lng: p.lng,
        p_quality: p.quality,
      });
    },
    pickupAddress: async (id: string) =>
      ((await rpc("pickup_address", { p_id: id })) ?? null) as PickupAddress | null,
    pendingPickups: async (limit: number) =>
      (await rpc("pickups_pending_geocode", { p_limit: limit })) as PickupAddress[],
    setPickupGeocode: async (
      id: string,
      status: "pending" | "ok" | "needs_review" | "failed",
      point: { lat: number; lng: number } | null,
    ) => {
      await rpc("set_pickup_geocode", {
        p_id: id,
        p_status: status,
        p_lat: point?.lat ?? null,
        p_lng: point?.lng ?? null,
      });
    },
  };
}

export type GeocodeRepo = ReturnType<typeof createGeocodeRepo>;

/**
 * Error from a database function. `code` is the SQLSTATE; for business-rule
 * errors (P0001) `message` is a short code such as "slot_has_pickups". Other
 * Postgres messages are dropped because they can echo row values (PII).
 */
export class RpcError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RpcError";
  }
  get forbidden() {
    return this.code === "42501";
  }
}

export function toRpcError(fn: string, code: string | undefined, message: string | undefined) {
  const c = code ?? "unknown";
  return new RpcError(c, c === "P0001" && message ? message : `rpc ${fn} failed (${c})`);
}

/** Arrays become Postgres array literals so enum[]/date[] params work in PGlite. */
function toPgParam(v: unknown): unknown {
  if (!Array.isArray(v)) return v;
  return `{${v.map((x) => `"${String(x).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}

type PgClient = {
  query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
  exec: (sql: string) => Promise<unknown>;
};
type PgDb = PgClient & { transaction: <T>(fn: (tx: PgClient) => Promise<T>) => Promise<T> };

/**
 * Calls `select fn(arg => $1, ...)` on PGlite. With `asUser`, runs as the
 * `authenticated` role with that user id, mirroring a Supabase user JWT.
 */
export function pgRpc(db: PgDb, opts: { asUser?: string } = {}): Rpc {
  return async (fn, args = {}) => {
    if (!/^[a-z_]+$/.test(fn)) throw new Error("invalid function name");
    const keys = Object.keys(args);
    for (const k of keys) if (!/^p_?[a-z_]*$/.test(k)) throw new Error("invalid argument name");
    const sql = `select ${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
    const params = keys.map((k) => toPgParam(args[k]));
    const run = async (c: PgClient) =>
      (await c.query<{ r: unknown }>(sql, params)).rows[0]?.r ?? null;
    try {
      if (!opts.asUser) return await run(db);
      const uid = opts.asUser;
      return await db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
        await tx.exec("set local role authenticated");
        return run(tx);
      });
    } catch (err) {
      const e = err as { code?: string; message?: string };
      throw toRpcError(fn, e.code, e.message);
    }
  };
}
