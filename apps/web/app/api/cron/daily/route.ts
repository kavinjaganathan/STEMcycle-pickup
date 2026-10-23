import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { getGeocodeRepo, getRepo } from "@/lib/db";
import { geocodePending } from "@/lib/geocode";
import { getGeocoder } from "@/lib/geocode-server";
import { log } from "@/lib/logger";

export const maxDuration = 60;

/**
 * Daily job (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`):
 * data-retention clean-up, retry geocoding, and a database query that also
 * keeps the free Supabase project from pausing.
 */
export async function GET(request: Request) {
  await connection();
  const secret = process.env.CRON_SECRET ?? "";
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const ok =
    secret.length >= 16 &&
    given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    const maintenance = await (await getRepo()).runMaintenance();
    const geocoded = await geocodePending(await getGeocodeRepo(), await getGeocoder(), 20).catch(
      (err) => {
        log("warn", "cron_geocode_failed", { err });
        return null;
      },
    );
    log("info", "cron_daily", { ...maintenance, geocoded: geocoded?.processed ?? 0 });
    return Response.json({ ok: true, ...maintenance, geocoded });
  } catch (err) {
    log("error", "cron_daily_failed", { err });
    return Response.json({ ok: false }, { status: 500 });
  }
}
