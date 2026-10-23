import { json, withAuth } from "@/lib/api";
import { pickupQuerySchema } from "@/lib/admin-schemas";
import { createAdminApi } from "@/lib/db/admin";

export const GET = withAuth("admin", async ({ rpc }, request) => {
  const q = pickupQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const pickups = await createAdminApi(rpc).listPickups(q.from, q.to, q.status);
  return json({ pickups });
});
