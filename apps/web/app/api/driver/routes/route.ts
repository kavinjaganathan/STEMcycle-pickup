import { weekendParam } from "@/lib/admin-schemas";
import { json, withDriver } from "@/lib/api";
import { createDriverApi } from "@/lib/db/driver";

export const GET = withDriver(async ({ rpc }, request) => {
  const weekend = weekendParam.parse(new URL(request.url).searchParams.get("weekend"));
  return json(await createDriverApi(rpc).routes(weekend));
});
