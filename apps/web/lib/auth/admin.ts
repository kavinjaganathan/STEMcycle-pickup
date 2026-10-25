import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getServiceRpc } from "@/lib/db";
import type { Rpc } from "@/lib/db/repo";
import { env } from "@/lib/env";
import { verifyPassword } from "./passwords";

/**
 * One shared admin login whose credentials live in environment variables
 * (ADMIN_EMAIL, ADMIN_PASSWORD_HASH). A successful login gets a signed,
 * httpOnly session cookie; changing the password or the secret signs
 * everyone out. Admin work then runs through the service role.
 */
export const ADMIN_COOKIE = "sc_admin";
export const ADMIN_SESSION_HOURS = 12;

/** Local development password when ADMIN_PASSWORD_HASH isn't set. */
export const LOCAL_ADMIN_PASSWORD = "stemcycle-admin";

export async function checkAdminCredentials(email: string, password: string): Promise<boolean> {
  const hash = env.adminPasswordHash;
  const passwordOk = hash
    ? await verifyPassword(password, hash)
    : constantTimeEqual(password, LOCAL_ADMIN_PASSWORD);
  // Evaluate both so timing doesn't reveal which one was wrong.
  const emailOk = constantTimeEqual(email.trim().toLowerCase(), env.adminEmail);
  return passwordOk && emailOk;
}

function constantTimeEqual(a: string, b: string) {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

/** Binds sessions to the current credentials so rotating them revokes old cookies. */
function sign(expires: number) {
  const binding = `${env.adminEmail}|${env.adminPasswordHash ?? "local"}`;
  return createHmac("sha256", env.adminSessionSecret)
    .update(`admin|${expires}|${binding}`)
    .digest("base64url");
}

export async function startAdminSession() {
  const expires = Date.now() + ADMIN_SESSION_HOURS * 3600 * 1000;
  (await cookies()).set(ADMIN_COOKIE, `${expires}.${sign(expires)}`, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_HOURS * 3600,
  });
}

export async function endAdminSession() {
  (await cookies()).delete(ADMIN_COOKIE);
}

export function isValidAdminCookie(value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const [exp, sig] = value.split(".");
  const expires = Number(exp);
  if (!Number.isFinite(expires) || expires < now || !sig) return false;
  const expected = Buffer.from(sign(expires));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The admin's RPC client (service role) if the request has a valid admin session. */
export async function getAdmin(): Promise<{ rpc: Rpc } | null> {
  await connection();
  if (!isValidAdminCookie((await cookies()).get(ADMIN_COOKIE)?.value)) return null;
  return { rpc: await getServiceRpc() };
}
