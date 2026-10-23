import "server-only";
import { getGeocodeRepo } from "@/lib/db";
import { env } from "@/lib/env";
import {
  fakeGeocoder,
  nominatimGeocoder,
  nominatimSearch,
  TemporaryGeocodeError,
  type Geocoder,
} from "@/lib/geocode";

const NOMINATIM_INTERVAL_MS = 1100;
const MAX_WAIT_MS = 15_000;

/** The configured geocoder: Nominatim, or the deterministic fake (GEOCODER=fake, local only). */
export async function getGeocoder(): Promise<Geocoder> {
  if (process.env.GEOCODER === "fake") {
    if (env.isHosted) throw new Error("The fake geocoder is for local development only");
    return fakeGeocoder;
  }
  return nominatimGeocoder(await throttle());
}

/** Free-text lookup for depot addresses. */
export async function searchPlace(q: string) {
  if (process.env.GEOCODER === "fake") {
    const p = await fakeGeocoder({ street: q, city: "", zip: "" });
    return p && { lat: p.lat, lng: p.lng };
  }
  return nominatimSearch(await throttle())(q);
}

async function throttle() {
  const repo = await getGeocodeRepo();
  return async () => {
    const wait = await repo.reserve(NOMINATIM_INTERVAL_MS);
    if (wait > MAX_WAIT_MS) throw new TemporaryGeocodeError("queue busy");
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  };
}
