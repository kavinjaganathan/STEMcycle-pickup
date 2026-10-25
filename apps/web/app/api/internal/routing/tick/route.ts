import { connection } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { log } from "@/lib/logger";
import { runRoutingTick } from "@/lib/routing/scheduler";
import { getSchedulerDeps } from "@/lib/routing/server";

// The solver may need to wake up (Render free tier), so allow a long request.
export const maxDuration = 300;

/**
 * Called every minute by pg_cron (supabase/cron.sql) with the CRON_SECRET.
 * Re-plans weekends whose changes have gone quiet, and locks weekends whose
 * Friday deadline has passed. Cheap when there's nothing to do.
 */
export async function POST(request: Request) {
  await connection();
  if (!isCronRequest(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const runs = await runRoutingTick(await getSchedulerDeps());
    return Response.json({ ok: true, runs });
  } catch (err) {
    log("error", "routing_tick_failed", { err });
    return Response.json({ ok: false }, { status: 500 });
  }
}
