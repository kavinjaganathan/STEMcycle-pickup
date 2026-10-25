import { json, withAdmin } from "@/lib/api";

export const GET = withAdmin(async ({ rpc }) => json(await rpc("admin_get_settings")));
