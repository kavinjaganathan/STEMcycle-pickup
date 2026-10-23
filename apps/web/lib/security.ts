import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";

/** 256-bit cancel token for the emailed link; only its hash is stored. */
export function newCancelToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Salted hash used as a rate-limit key so raw IPs/emails never hit the DB. */
export function rateKey(kind: string, value: string): string {
  return `${kind}:${createHash("sha256").update(`${env.rateLimitSalt}:${value}`).digest("hex").slice(0, 32)}`;
}

/** Client IP. On Vercel both headers are set by the platform (not spoofable). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}

const TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = env.turnstileSecret;
  if (!secret) {
    // Locally it's fine to skip; when hosted, fail closed.
    if (env.isHosted) {
      log("error", "turnstile_secret_missing");
      return false;
    }
    return true;
  }
  if (!token) return false;
  try {
    const res = await fetch(TURNSTILE_URL, {
      method: "POST",
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    log("warn", "turnstile_unreachable");
    return false;
  }
}
