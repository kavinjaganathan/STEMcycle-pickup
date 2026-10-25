import { weekendParam } from "@/lib/admin-schemas";
import { json, withAdmin } from "@/lib/api";
import { createRoutingApi } from "@/lib/db/routing";

export const GET = withAdmin<{ weekend: string }>(async ({ rpc }, _request, { weekend }) =>
  json(await createRoutingApi(rpc).weekend(weekendParam.parse(weekend))),
);
