import { connection } from "next/server";
import { getGeocodeRepo, getRepo } from "@/lib/db";
import { geocodePending } from "@/lib/geocode";
import { getGeocoder } from "@/lib/geocode-server";
import { isCronRequest } from "@/lib/cron-auth";
import { log } from "@/lib/logger";
import { runRoutingTick } from "@/lib/routing/scheduler";
import { getSchedulerDeps } from "@/lib/routing/server";

export const maxDuration = 300;

/**
 * Daily job (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`):
 * data-retention clean-up, retry geocoding, a routing tick (backup for the
 * per-minute pg_cron tick), and a database query that also keeps the free
 * Supabase project from pausing.
 */
export async function GET(request: Request) {
  await connection();
  if (!isCronRequest(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    const maintenance = await (await getRepo()).runMaintenance();
    const geocoded = await geocodePending(await getGeocodeRepo(), await getGeocoder(), 20).catch(
      (err) => {
        log("warn", "cron_geocode_failed", { err });
        return null;
      },
    );
    const routed = await runRoutingTick(await getSchedulerDeps()).catch((err) => {
      log("warn", "cron_routing_failed", { err });
      return [];
    });
    log("info", "cron_daily", {
      ...maintenance,
      geocoded: geocoded?.processed ?? 0,
      routed: routed.length,
    });
    return Response.json({ ok: true, ...maintenance, geocoded, routed });
  } catch (err) {
    log("error", "cron_daily_failed", { err });
    return Response.json({ ok: false }, { status: 500 });
  }
}
