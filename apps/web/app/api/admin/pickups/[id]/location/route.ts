import { z } from "zod";
import { json, parseBody, withAuth } from "@/lib/api";
import { createAdminApi } from "@/lib/db/admin";

const schema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

// Admin drops the pin by hand (marks the location as verified).
export const PUT = withAuth<{ id: string }>("admin", async ({ rpc }, request, { id }) => {
  const { lat, lng } = await parseBody(request, schema);
  await createAdminApi(rpc).setPickupLocation(z.uuid().parse(id), lat, lng);
  return json({ ok: true });
});
