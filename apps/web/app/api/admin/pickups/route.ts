import { pickupQuerySchema } from "@/lib/admin-schemas";
import { json, withAdmin } from "@/lib/api";
import { createAdminApi } from "@/lib/db/admin";

export const GET = withAdmin(async ({ rpc }, request) => {
  const q = pickupQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  return json({ pickups: await createAdminApi(rpc).listPickups(q.from, q.to, q.status) });
});
