import { json, parseBody, withAuth } from "@/lib/api";
import { depotSchema } from "@/lib/admin-schemas";
import { createAdminApi } from "@/lib/db/admin";

export const GET = withAuth("admin", async ({ rpc }) =>
  json({ depots: await createAdminApi(rpc).listDepots() }),
);

export const POST = withAuth("admin", async ({ rpc }, request) => {
  const body = await parseBody(request, depotSchema);
  return json(await createAdminApi(rpc).saveDepot(body), 201);
});
