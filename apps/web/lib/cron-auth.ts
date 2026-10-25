import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Checks `Authorization: Bearer $CRON_SECRET` (Vercel Cron and pg_cron both send it). */
export function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return (
    secret.length >= 16 &&
    given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  );
}
