import "server-only";
import { log } from "@/lib/logger";
import type { Problem, Solution } from "./types";

/**
 * Calls the OR-Tools service. Returns null (so the caller uses the fallback)
 * if it isn't configured, is still waking up past the timeout, or errors.
 */
export async function solveRemote(problem: Problem): Promise<Solution | null> {
  const url = process.env.SOLVER_URL;
  const secret = process.env.SOLVER_SECRET;
  if (!url || !secret) return null;
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/solve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Solver-Secret": secret },
      body: JSON.stringify(problem),
      // Render's free tier sleeps when idle; waking can take ~30-60s.
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`solver http ${res.status}`);
    return (await res.json()) as Solution;
  } catch (err) {
    log("warn", "solver_unavailable", { err });
    return null;
  }
}
