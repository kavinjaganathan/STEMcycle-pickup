import { z } from "zod";
import { pickupStatusSchema } from "@/lib/admin-schemas";
import { json, parseBody, withAdmin } from "@/lib/api";
import { createAdminApi } from "@/lib/db/admin";

export const PATCH = withAdmin<{ id: string }>(async ({ rpc }, request, { id }) => {
  const { status } = await parseBody(request, pickupStatusSchema);
  await createAdminApi(rpc).setPickupStatus(z.uuid().parse(id), status);
  return json({ ok: true });
});
