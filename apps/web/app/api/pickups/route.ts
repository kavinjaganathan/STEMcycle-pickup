import { after } from "next/server";
import { getGeocodeRepo } from "@/lib/db";
import { getDeps, readJson } from "@/lib/deps";
import { geocodePickup } from "@/lib/geocode";
import { getGeocoder } from "@/lib/geocode-server";
import { log } from "@/lib/logger";
import { submitPickup } from "@/lib/pickups/service";
import { clientIp } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const deps = await getDeps();
    const { status, body, pickupId } = await submitPickup(
      deps,
      await readJson(request),
      clientIp(request.headers),
    );
    // Geocode after responding so the resident isn't kept waiting.
    if (pickupId) after(() => geocodeNow(pickupId));
    return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    log("error", "pickup_submit_failed", { err });
    return Response.json(
      { ok: false, error: "Something went wrong on our end. Please try again." },
      { status: 500 },
    );
  }
}

async function geocodeNow(pickupId: string) {
  try {
    const repo = await getGeocodeRepo();
    const address = await repo.pickupAddress(pickupId);
    if (address) await geocodePickup(repo, await getGeocoder(), address);
  } catch (err) {
    // Stays "pending"; the daily job and route planning retry it.
    log("warn", "geocode_after_submit_failed", { pickup_id: pickupId, err });
  }
}
