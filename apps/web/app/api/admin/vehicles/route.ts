import { json, parseBody, withAuth } from "@/lib/api";
import { vehicleSchema } from "@/lib/admin-schemas";
import { createAdminApi } from "@/lib/db/admin";

export const GET = withAuth("admin", async ({ rpc }) =>
  json({ vehicles: await createAdminApi(rpc).listVehicles() }),
);

export const POST = withAuth("admin", async ({ rpc }, request) => {
  const body = await parseBody(request, vehicleSchema);
  return json(await createAdminApi(rpc).saveVehicle(body), 201);
});
