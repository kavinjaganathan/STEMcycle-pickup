import { z } from "zod";
import { json, parseBody, withAuth } from "@/lib/api";
import { vehicleSchema } from "@/lib/admin-schemas";
import { createAdminApi } from "@/lib/db/admin";

export const PATCH = withAuth<{ id: string }>("admin", async ({ rpc }, request, { id }) => {
  const body = await parseBody(request, vehicleSchema);
  return json(await createAdminApi(rpc).saveVehicle({ ...body, id: z.uuid().parse(id) }));
});

export const DELETE = withAuth<{ id: string }>("admin", async ({ rpc }, _request, { id }) => {
  await createAdminApi(rpc).deleteVehicle(z.uuid().parse(id));
  return json({ ok: true });
});
