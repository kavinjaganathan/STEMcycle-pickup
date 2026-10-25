import { weekendParam } from "@/lib/admin-schemas";
import { json, withAdmin } from "@/lib/api";
import { RoutingError } from "@/lib/routing/matrix";
import { RoutingBusyError, runWeekendNow } from "@/lib/routing/scheduler";
import { getSchedulerDeps } from "@/lib/routing/server";

export const maxDuration = 300;

/** Admin "Re-run routing now" for one weekend. */
export const POST = withAdmin<{ weekend: string }>(async (_ctx, _request, { weekend }) => {
  try {
    const res = await runWeekendNow(await getSchedulerDeps(), weekendParam.parse(weekend));
    if (res.status === "failed")
      return json({ error: "Routing failed. Check the travel-time service and try again." }, 502);
    return json(res);
  } catch (err) {
    if (err instanceof RoutingBusyError) return json({ error: err.message }, 409);
    if (err instanceof RoutingError) return json({ error: err.message }, 502);
    throw err;
  }
});
