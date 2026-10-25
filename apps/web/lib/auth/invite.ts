import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Driver sign-up is by invitation. With DRIVER_INVITE_CODE set, /signup only
 * works through the admin's invite link (/signup?invite=CODE), and the API
 * rejects sign-ups without the code. Every new account still needs the admin's
 * approval before it can see anything. Rotating the code retires old links.
 */
export function inviteCode(): string | null {
  const v = process.env.DRIVER_INVITE_CODE?.trim();
  return v ? v : null;
}

export function inviteOk(given: string | null | undefined): boolean {
  const code = inviteCode();
  if (!code) return true;
  const a = createHash("sha256")
    .update(given ?? "")
    .digest();
  const b = createHash("sha256").update(code).digest();
  return timingSafeEqual(a, b);
}

export function inviteUrl(): string | null {
  const code = inviteCode();
  return code ? `${env.appUrl}/signup?invite=${encodeURIComponent(code)}` : null;
}
