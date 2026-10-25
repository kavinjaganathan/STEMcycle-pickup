import type { Claim, RoutingApi } from "@/lib/db/routing";
import type { PublicSettings } from "@/lib/db/repo";
import type { SendEmail } from "@/lib/email";
import { routeEmail } from "@/lib/email/templates";
import { log } from "@/lib/logger";
import { planDay, type PlanDeps } from "./plan";

/**
 * Automatic routing. Bookings, cancellations, availability and settings
 * changes mark their weekend "dirty" in the database. A tick (every minute,
 * from pg_cron in production or a timer locally) re-plans each weekend that
 * has been quiet for QUIET_SECONDS, so a burst of changes causes one run.
 * At the Friday lock time a final run publishes the routes and emails drivers.
 */
export type SchedulerDeps = PlanDeps & {
  routing: RoutingApi;
  sendEmail: SendEmail;
  settings: () => Promise<PublicSettings>;
  appUrl: string;
  now: () => Date;
  /** Best-effort geocoding of waiting pickups before planning. */
  geocodePending?: () => Promise<unknown>;
};

export function quietSeconds(): number {
  const v = Number(process.env.ROUTING_QUIET_SECONDS);
  return Number.isFinite(v) && v >= 0 ? v : 120;
}

export type RunResult = { weekend: string; final: boolean; status: "ok" | "failed" };

export async function runRoutingTick(deps: SchedulerDeps): Promise<RunResult[]> {
  const claims = await deps.routing.claimWork(deps.now(), quietSeconds());
  const results: RunResult[] = [];
  for (const c of claims) results.push(await runClaim(deps, c, { notifyChanges: false }));
  return results;
}

export class RoutingBusyError extends Error {}

/** Admin "re-run now": plans the weekend immediately and tells drivers if a locked route changed. */
export async function runWeekendNow(deps: SchedulerDeps, weekend: string): Promise<RunResult> {
  const claim = await deps.routing.claimWeekend(weekend, deps.now());
  if (!claim) throw new RoutingBusyError("Routing is already running for this weekend.");
  return runClaim(deps, claim, { notifyChanges: true });
}

async function runClaim(
  deps: SchedulerDeps,
  c: Claim,
  opts: { notifyChanges: boolean },
): Promise<RunResult> {
  const started = Date.now();
  const changed = new Set<string>();
  try {
    await deps.geocodePending?.().catch(() => undefined);
    for (const date of [c.weekend, addDays(c.weekend, 1)]) {
      const plan = await planDay(deps, date, await deps.routing.inputs(date));
      const saved = await deps.routing.savePlan(plan);
      for (const id of saved.changed_driver_ids) changed.add(id);
    }
  } catch (err) {
    log("error", "routing_run_failed", { weekend: c.weekend, err });
    // Leave the weekend dirty (and unlocked) so the next tick retries.
    await deps.routing.finishRun({ ...c, dirty_at: null, final: false }, "failed");
    return { weekend: c.weekend, final: c.final, status: "failed" };
  }
  await deps.routing.finishRun(c, "ok");
  log("info", "routing_run", {
    weekend: c.weekend,
    final: c.final,
    changed_drivers: changed.size,
    ms: Date.now() - started,
  });

  if (c.final) {
    await notifyDrivers(deps, c.weekend, null, "ready");
  } else if (opts.notifyChanges && changed.size > 0) {
    const w = await deps.routing.weekend(c.weekend);
    if (w.locked_at) await notifyDrivers(deps, c.weekend, [...changed], "changed");
  }
  return { weekend: c.weekend, final: c.final, status: "ok" };
}

async function notifyDrivers(
  deps: SchedulerDeps,
  weekend: string,
  driverIds: string[] | null,
  kind: "ready" | "changed",
) {
  const [settings, contacts] = await Promise.all([
    deps.settings(),
    deps.routing.driverContacts(weekend, driverIds),
  ]);
  for (const d of contacts) {
    try {
      await deps.sendEmail(
        {
          to: d.email,
          ...routeEmail({
            orgName: settings.org_name,
            name: d.full_name,
            weekendDate: weekend,
            appUrl: deps.appUrl,
            kind,
          }),
        },
        { displayName: settings.email_display_name },
      );
    } catch (err) {
      log("error", "route_email_failed", { driver_id: d.id, err });
    }
  }
}

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
