/**
 * Local development only: there's no pg_cron, so run the routing tick on a
 * timer inside the Node server. Hosted deployments use pg_cron (see
 * supabase/cron.sql) and never start this.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VERCEL || process.env.SUPABASE_URL || process.env.DATA_BACKEND === "supabase")
    return;
  if (process.env.LOCAL_ROUTING_TICK === "off") return;
  const seconds = Number(process.env.LOCAL_ROUTING_TICK_SECONDS ?? 30);
  const { startLocalTicker } = await import("./lib/routing/local-ticker");
  startLocalTicker(seconds * 1000);
}
