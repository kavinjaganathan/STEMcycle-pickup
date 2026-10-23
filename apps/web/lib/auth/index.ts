import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLocalDb, serviceClient, supabaseRpc } from "@/lib/db";
import { pgRpc, type Rpc } from "@/lib/db/repo";
import { env } from "@/lib/env";

export type Role = "admin" | "driver";
export type SessionUser = { id: string; email: string; role: Role; full_name: string };
export type AuthContext = { user: SessionUser; rpc: Rpc };

export const DEV_COOKIE = "sc_dev_session";

/** Supabase client bound to the request cookies (Supabase backend only). */
export async function supabaseServer(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const c of list) store.set(c.name, c.value, c.options);
        } catch {
          // Called from a Server Component; the proxy refreshes cookies instead.
        }
      },
    },
  });
}

/** The signed-in, active user and an RPC client that runs as them, or null. */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  // Sessions are strictly per-request: never part of any prerender.
  await connection();
  let rpc: Rpc;
  if (env.dataBackend === "supabase") {
    const sb = await supabaseServer();
    const { data } = await sb.auth.getUser();
    if (!data.user) return null;
    rpc = supabaseRpc(sb);
  } else {
    const uid = readDevSession((await cookies()).get(DEV_COOKIE)?.value);
    if (!uid) return null;
    rpc = pgRpc(await getLocalDb(), { asUser: uid });
  }
  const profile = (await rpc("my_profile")) as (SessionUser & { active: boolean }) | null;
  if (!profile || !profile.active) return null;
  const { id, email, role, full_name } = profile;
  return { user: { id, email, role, full_name }, rpc };
});

// --- Local development sessions (never used on hosted deployments) ---------

function devSecret(): string {
  if (env.isHosted || env.dataBackend !== "local") throw new Error("dev sessions are local-only");
  return process.env.DEV_SESSION_SECRET ?? "local-dev-session-secret";
}

function sign(value: string) {
  return createHmac("sha256", devSecret()).update(value).digest("base64url");
}

export function makeDevSession(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

function readDevSession(cookie: string | undefined): string | null {
  if (!cookie) return null;
  const [uid, sig] = cookie.split(".");
  if (!uid || !sig) return null;
  const expected = Buffer.from(sign(uid));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? uid : null;
}

// --- Creating team members ---------------------------------------------------

/**
 * Creates a login for a new admin/driver. On Supabase this makes a confirmed
 * user with a one-time temporary password (shown once to the admin) so no
 * invite email is needed; they can switch to magic-link sign-in or change it.
 */
export async function createAuthUser(
  email: string,
): Promise<{ id: string; tempPassword: string | null }> {
  if (env.dataBackend === "supabase") {
    const tempPassword = randomBytes(12).toString("base64url");
    const { data, error } = await serviceClient().auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });
    if (error || !data.user)
      throw new Error(error?.code === "email_exists" ? "email_exists" : "create_user_failed");
    return { id: data.user.id, tempPassword };
  }
  const db = await getLocalDb();
  const existing = await db.query("select 1 from auth.users where email = $1", [email]);
  if (existing.rows.length) throw new Error("email_exists");
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [email],
  );
  return { id: rows[0].id, tempPassword: null };
}
