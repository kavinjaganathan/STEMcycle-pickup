import "server-only";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { createRepo, pgRpc, toRpcError, type Repo, type Rpc } from "./repo";

const g = globalThis as unknown as {
  __stemcycleRepo?: Promise<Repo>;
  __stemcycleLocalDb?: Promise<PGlite>;
};

/** Service-level repository (Supabase service role in production, PGlite locally). */
export function getRepo(): Promise<Repo> {
  g.__stemcycleRepo ??= (async () => {
    if (env.dataBackend === "supabase") return createRepo(supabaseRpc(serviceClient()));
    return createRepo(pgRpc(await getLocalDb()));
  })().catch((err) => {
    g.__stemcycleRepo = undefined; // allow a retry on the next request
    throw err;
  });
  return g.__stemcycleRepo;
}

/** The embedded local database (local backend only). */
export function getLocalDb(): Promise<PGlite> {
  if (env.dataBackend !== "local") throw new Error("Local database is not in use");
  if (env.isHosted) throw new Error("Local database backend is not allowed on hosted deployments");
  g.__stemcycleLocalDb ??= (async () => {
    const { createLocalDb } = await import("./pglite");
    const dataDir = process.env.LOCAL_DB_DIR ?? path.resolve(process.cwd(), ".data/pglite");
    return createLocalDb({ dataDir, seed: true });
  })().catch((err) => {
    g.__stemcycleLocalDb = undefined;
    throw err;
  });
  return g.__stemcycleLocalDb;
}

export function serviceClient(): SupabaseClient {
  return createClient(env.supabaseUrl(), env.supabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function supabaseRpc(client: SupabaseClient): Rpc {
  return async (fn, args) => {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw toRpcError(fn, error.code, error.message);
    return data;
  };
}
