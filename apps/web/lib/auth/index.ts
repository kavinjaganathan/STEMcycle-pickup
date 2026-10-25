import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLocalDb, getRepo, serviceClient, supabaseRpc } from "@/lib/db";
import { pgRpc, type Rpc } from "@/lib/db/repo";
import { env } from "@/lib/env";
import { hashPassword, verifyPassword } from "./passwords";

export type DriverStatus = "pending" | "active" | "disabled";
export type Driver = {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  capacity_boxes: number;
  status: DriverStatus;
};
export type DriverContext = { driver: Driver; rpc: Rpc };

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

/**
 * The signed-in driver (any status) and an RPC client that runs as them, or
 * null. Driver functions check `status = 'active'` themselves.
 */
export const getDriver = cache(async (): Promise<DriverContext | null> => {
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
  const driver = (await rpc("my_profile")) as Driver | null;
  return driver ? { driver, rpc } : null;
});

// --- Sign-up, sign-in, sign-out -------------------------------------------

export type SignupInput = {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  capacity_boxes: number;
};

/**
 * Creates a pending driver account (no access until the admin approves it).
 * On Supabase this uses the admin API, which works with public sign-ups
 * turned off. Returns false if the email already has an account; the caller
 * answers the same either way, so sign-up can't be used to probe emails.
 */
export async function createDriverAccount(input: SignupInput): Promise<boolean> {
  let id: string;
  if (env.dataBackend === "supabase") {
    const { data, error } = await serviceClient().auth.admin.createUser({
      email: input.email,
      password: input.password,
      // The admin reviews every sign-up (and its email) before approving it.
      email_confirm: true,
    });
    if (error || !data.user) {
      if (error?.code === "email_exists" || error?.status === 422) return false;
      throw new Error("create_user_failed");
    }
    id = data.user.id;
  } else {
    const db = await getLocalDb();
    const exists = await db.query("select 1 from auth.users where email = $1", [input.email]);
    if (exists.rows.length) return false;
    const { rows } = await db.query<{ id: string }>(
      "insert into auth.users (email, encrypted_password, email_confirmed_at) values ($1, $2, now()) returning id",
      [input.email, await hashPassword(input.password)],
    );
    id = rows[0].id;
  }
  await (await getRepo()).registerDriver(id, input);
  return true;
}

/** One-time link handled by /auth/confirm (the token travels once, then is spent). */
function authLink(tokenHash: string, type: "recovery") {
  return `${env.appUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${type}`;
}

/** Password-reset link for an existing driver, or null if there's no such account. */
export async function createRecoveryLink(email: string): Promise<string | null> {
  if (env.dataBackend !== "supabase") return null;
  const { data, error } = await serviceClient().auth.admin.generateLink({
    type: "recovery",
    email,
  });
  if (error || !data.properties) return null;
  return authLink(data.properties.hashed_token, "recovery");
}

export async function signInDriver(email: string, password: string): Promise<boolean> {
  if (env.dataBackend === "supabase") {
    const { error } = await (await supabaseServer()).auth.signInWithPassword({ email, password });
    return !error;
  }
  const db = await getLocalDb();
  const { rows } = await db.query<{ id: string; encrypted_password: string | null }>(
    "select id, encrypted_password from auth.users where email = $1",
    [email],
  );
  const ok = rows[0]?.encrypted_password
    ? await verifyPassword(password, rows[0].encrypted_password)
    : false;
  if (ok) await startDevSession(rows[0].id);
  return ok;
}

export async function signOutDriver() {
  if (env.dataBackend === "supabase") await (await supabaseServer()).auth.signOut();
  else (await cookies()).delete(DEV_COOKIE);
}

export async function changeDriverPassword(driverId: string, password: string): Promise<boolean> {
  if (env.dataBackend === "supabase") {
    const { error } = await (await supabaseServer()).auth.updateUser({ password });
    return !error;
  }
  const db = await getLocalDb();
  await db.query("update auth.users set encrypted_password = $2 where id = $1", [
    driverId,
    await hashPassword(password),
  ]);
  return true;
}

// --- Local development sessions (never used on hosted deployments) ---------

function devSecret(): string {
  if (env.isHosted || env.dataBackend !== "local") throw new Error("dev sessions are local-only");
  return process.env.DEV_SESSION_SECRET ?? "local-dev-session-secret";
}

function sign(value: string) {
  return createHmac("sha256", devSecret()).update(value).digest("base64url");
}

export async function startDevSession(userId: string) {
  (await cookies()).set(DEV_COOKIE, `${userId}.${sign(userId)}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

function readDevSession(cookie: string | undefined): string | null {
  if (!cookie) return null;
  const [uid, sig] = cookie.split(".");
  if (!uid || !sig) return null;
  const expected = Buffer.from(sign(uid));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? uid : null;
}
