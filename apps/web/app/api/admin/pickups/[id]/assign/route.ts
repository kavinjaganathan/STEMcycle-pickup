import { z } from "zod";
import { json, parseBody, withAdmin } from "@/lib/api";
import { createAdminApi } from "@/lib/db/admin";
import { log } from "@/lib/logger";
import { RoutingBusyError, runWeekendNow } from "@/lib/routing/scheduler";
import { getSchedulerDeps } from "@/lib/routing/server";

export const maxDuration = 300;

const schema = z.object({ driver_id: z.uuid().nullable() });

/**
 * Override: keep a pickup on one driver's route (or hand it back to the
 * planner with null), then re-plan that weekend straight away.
 */
export const POST = withAdmin<{ id: string }>(async ({ rpc }, request, { id }) => {
  const { driver_id } = await parseBody(request, schema);
  const { slot_date } = await createAdminApi(rpc).pinPickup(z.uuid().parse(id), driver_id);
  const d = new Date(`${slot_date}T00:00:00Z`);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() - 1);
  const weekend = d.toISOString().slice(0, 10);
  try {
    await runWeekendNow(await getSchedulerDeps(), weekend);
    return json({ ok: true, replanned: true });
  } catch (err) {
    // The pin is saved and the weekend is marked dirty, so the next tick re-plans it.
    if (!(err instanceof RoutingBusyError)) log("warn", "assign_replan_failed", { err });
    return json({ ok: true, replanned: false });
  }
});
