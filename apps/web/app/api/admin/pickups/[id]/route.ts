import { z } from "zod";
import { json, parseBody, withAuth } from "@/lib/api";
import { pickupStatusSchema } from "@/lib/admin-schemas";
import { createAdminApi } from "@/lib/db/admin";

export const PATCH = withAuth<{ id: string }>("admin", async ({ rpc }, request, { id }) => {
  const body = await parseBody(request, pickupStatusSchema);
  await createAdminApi(rpc).setPickupStatus(z.uuid().parse(id), body.status);
  return json({ ok: true });
});
