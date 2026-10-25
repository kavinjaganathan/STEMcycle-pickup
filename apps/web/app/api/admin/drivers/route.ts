import { json, withAdmin } from "@/lib/api";
import { createAdminApi } from "@/lib/db/admin";

export const GET = withAdmin(async ({ rpc }) =>
  json({ drivers: await createAdminApi(rpc).listDrivers() }),
);
