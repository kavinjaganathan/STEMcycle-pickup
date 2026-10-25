import { log } from "@/lib/logger";
import { runRoutingTick } from "./scheduler";
import { getSchedulerDeps } from "./server";

const g = globalThis as unknown as { __stemcycleTicker?: NodeJS.Timeout };

/** Runs the routing tick every `ms` in this process (local backend only). */
export function startLocalTicker(ms: number) {
  if (g.__stemcycleTicker) return;
  let running = false;
  g.__stemcycleTicker = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const runs = await runRoutingTick(await getSchedulerDeps());
      if (runs.length) log("info", "local_routing_tick", { runs: runs.length });
    } catch (err) {
      log("warn", "local_routing_tick_failed", { err });
    } finally {
      running = false;
    }
  }, ms);
  g.__stemcycleTicker.unref?.();
}
