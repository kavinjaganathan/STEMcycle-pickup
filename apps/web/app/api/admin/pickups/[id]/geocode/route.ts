import { z } from "zod";
import { json, withAuth } from "@/lib/api";
import { getGeocodeRepo } from "@/lib/db";
import { geocodePickup } from "@/lib/geocode";
import { getGeocoder } from "@/lib/geocode-server";

// Admin-triggered retry for one pickup.
export const POST = withAuth<{ id: string }>("admin", async (_ctx, _request, { id }) => {
  const repo = await getGeocodeRepo();
  const address = await repo.pickupAddress(z.uuid().parse(id));
  if (!address) return json({ error: "That pickup no longer exists." }, 404);
  return json(await geocodePickup(repo, await getGeocoder(), address));
});
