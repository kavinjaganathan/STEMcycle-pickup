import { z } from "zod";
import { json, parseBody, withAdmin } from "@/lib/api";
import { getGeocodeRepo } from "@/lib/db";
import { createAdminApi } from "@/lib/db/admin";
import { geocodePickup } from "@/lib/geocode";
import { getGeocoder } from "@/lib/geocode-server";
import { pickupFormSchema } from "@/lib/validation";

const schema = pickupFormSchema.pick({ address_line: true, city: true, zip: true });

// Admin corrects the address, then we geocode it again straight away.
export const PUT = withAdmin<{ id: string }>(async ({ rpc }, request, { id }) => {
  const pickupId = z.uuid().parse(id);
  const address = await parseBody(request, schema);
  await createAdminApi(rpc).updatePickupAddress(pickupId, address);
  const repo = await getGeocodeRepo();
  return json(await geocodePickup(repo, await getGeocoder(), { id: pickupId, ...address }));
});
