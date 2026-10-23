import "server-only";
import { getRepo } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import type { Deps } from "@/lib/pickups/service";
import { verifyTurnstile } from "@/lib/security";

export async function getDeps(): Promise<Deps> {
  return {
    repo: await getRepo(),
    sendEmail,
    verifyTurnstile,
    appUrl: env.appUrl,
    now: () => new Date(),
  };
}

/** Parses a small JSON body; returns undefined for oversized or malformed input. */
export async function readJson(request: Request, maxBytes = 16_384): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
