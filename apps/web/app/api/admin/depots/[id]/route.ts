import { z } from "zod";
import { json, parseBody, withAuth } from "@/lib/api";
import { depotSchema } from "@/lib/admin-schemas";
import { createAdminApi } from "@/lib/db/admin";

export const PATCH = withAuth<{ id: string }>("admin", async ({ rpc }, request, { id }) => {
  const body = await parseBody(request, depotSchema);
  return json(await createAdminApi(rpc).saveDepot({ ...body, id: z.uuid().parse(id) }));
});

export const DELETE = withAuth<{ id: string }>("admin", async ({ rpc }, _request, { id }) => {
  await createAdminApi(rpc).deleteDepot(z.uuid().parse(id));
  return json({ ok: true });
});
