import "server-only";
import { createHash } from "node:crypto";
import type { GeocodeRepo, GeoPoint, PickupAddress } from "@/lib/db/repo";
import { log } from "@/lib/logger";

/** Rough service-area box: Carrollton/Richardson in the south to Prosper/McKinney in the north. */
export const SERVICE_BOX = { west: -97.1, east: -96.45, south: 32.88, north: 33.4 };
export const SERVICE_CENTER = { lat: 33.1, lng: -96.75 };

export type GeocodeOutcome =
  | { status: "ok" | "needs_review"; lat: number; lng: number }
  | { status: "failed" }
  | { status: "pending" }; // temporary problem: leave for a retry

export type Geocoder = (a: {
  street: string;
  city: string;
  zip: string;
}) => Promise<GeoPoint | null>;

export function normalizeAddress(street: string, city: string, zip: string): string {
  const clean = (s: string) => s.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  return `${clean(street)}|${clean(city)}|${zip.slice(0, 5)}`;
}

export function addressHash(street: string, city: string, zip: string): string {
  return createHash("sha256")
    .update(normalizeAddress(street, city, zip))
    .digest("hex");
}

export function inServiceArea(lat: number, lng: number): boolean {
  const b = SERVICE_BOX;
  return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

/** A temporary provider problem: the pickup stays "pending" and is retried later. */
export class TemporaryGeocodeError extends Error {}

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

function userAgent() {
  const contact = process.env.NOMINATIM_CONTACT_EMAIL ?? process.env.EMAIL_FROM ?? "";
  return `StemCyclePickup/1.0${contact ? ` (${contact})` : ""}`;
}

type NominatimResult = {
  lat: string;
  lon: string;
  address?: { house_number?: string; postcode?: string };
};

/** Nominatim (OpenStreetMap) structured search, limited to the service area. */
export function nominatimGeocoder(throttle: () => Promise<void>): Geocoder {
  return async ({ street, city, zip }) => {
    await throttle();
    const b = SERVICE_BOX;
    const params = new URLSearchParams({
      street,
      city,
      state: "TX",
      postalcode: zip,
      countrycodes: "us",
      format: "jsonv2",
      addressdetails: "1",
      limit: "1",
      viewbox: `${b.west},${b.north},${b.east},${b.south}`,
      bounded: "1",
    });
    let res: Response;
    try {
      res = await fetch(`${NOMINATIM}?${params}`, {
        headers: { "User-Agent": userAgent(), "Accept-Language": "en" },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new TemporaryGeocodeError("unreachable");
    }
    if (res.status === 429 || res.status >= 500)
      throw new TemporaryGeocodeError(`http ${res.status}`);
    if (!res.ok) return null;
    const [hit] = (await res.json()) as NominatimResult[];
    if (!hit) return null;
    const exact =
      Boolean(hit.address?.house_number) &&
      (!hit.address?.postcode || hit.address.postcode.startsWith(zip));
    return { lat: Number(hit.lat), lng: Number(hit.lon), quality: exact ? "exact" : "approximate" };
  };
}

/** Free-text search (used for depots), biased to the service area. */
export function nominatimSearch(throttle: () => Promise<void>) {
  return async (q: string): Promise<{ lat: number; lng: number } | null> => {
    await throttle();
    const b = SERVICE_BOX;
    const params = new URLSearchParams({
      q,
      countrycodes: "us",
      format: "jsonv2",
      limit: "1",
      viewbox: `${b.west},${b.north},${b.east},${b.south}`,
    });
    const res = await fetch(`${NOMINATIM}?${params}`, {
      headers: { "User-Agent": userAgent(), "Accept-Language": "en" },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!res?.ok) throw new TemporaryGeocodeError("search failed");
    const [hit] = (await res.json()) as NominatimResult[];
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  };
}

/**
 * Deterministic stand-in for tests and offline development (GEOCODER=fake).
 * Streets containing "nowhere" fail; streets without a house number are approximate.
 */
export const fakeGeocoder: Geocoder = async ({ street, city, zip }) => {
  if (/nowhere/i.test(street)) return null;
  const h = createHash("sha256")
    .update(normalizeAddress(street, city, zip))
    .digest();
  const b = SERVICE_BOX;
  const lat = b.south + 0.05 + (h.readUInt16BE(0) / 65535) * (b.north - b.south - 0.1);
  const lng = b.west + 0.05 + (h.readUInt16BE(2) / 65535) * (b.east - b.west - 0.1);
  return { lat, lng, quality: /^\d+\s/.test(street.trim()) ? "exact" : "approximate" };
};

/** Geocodes one address, using and filling the cache. */
export async function geocodeAddress(
  repo: GeocodeRepo,
  geocoder: Geocoder,
  a: { street: string; city: string; zip: string },
): Promise<GeocodeOutcome> {
  const hash = addressHash(a.street, a.city, a.zip);
  let point = await repo.cacheGet(hash);
  if (!point) {
    try {
      point = await geocoder(a);
    } catch (err) {
      if (err instanceof TemporaryGeocodeError) {
        log("warn", "geocode_temporary_failure", { reason: err.message });
        return { status: "pending" };
      }
      throw err;
    }
    if (!point) return { status: "failed" };
    await repo.cachePut(hash, point);
  }
  const ok = point.quality === "exact" && inServiceArea(point.lat, point.lng);
  return { status: ok ? "ok" : "needs_review", lat: point.lat, lng: point.lng };
}

/** Geocodes a stored pickup and records the result. */
export async function geocodePickup(repo: GeocodeRepo, geocoder: Geocoder, p: PickupAddress) {
  const out = await geocodeAddress(repo, geocoder, {
    street: p.address_line,
    city: p.city,
    zip: p.zip,
  });
  if (out.status === "pending") return out;
  await repo.setPickupGeocode(
    p.id,
    out.status,
    out.status === "failed" ? null : { lat: out.lat, lng: out.lng },
  );
  log("info", "pickup_geocoded", { pickup_id: p.id, result: out.status });
  return out;
}

/** Works through pickups still waiting for coordinates (used by cron and route planning). */
export async function geocodePending(repo: GeocodeRepo, geocoder: Geocoder, limit = 25) {
  const pending = await repo.pendingPickups(limit);
  let done = 0;
  for (const p of pending) {
    const out = await geocodePickup(repo, geocoder, p);
    if (out.status === "pending") break; // provider is having trouble; try later
    done++;
  }
  return { processed: done, remaining: pending.length - done };
}
