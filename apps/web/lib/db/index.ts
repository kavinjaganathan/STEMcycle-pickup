import "server-only";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { createRepo, pgRpc, type Repo, type Rpc } from "./repo";

const globalForDb = globalThis as unknown as { __stemcycleRepo?: Promise<Repo> };

/** The data repository for this process (Supabase in production, PGlite locally). */
export function getRepo(): Promise<Repo> {
  globalForDb.__stemcycleRepo ??= init().catch((err) => {
    globalForDb.__stemcycleRepo = undefined; // allow a retry on the next request
    throw err;
  });
  return globalForDb.__stemcycleRepo;
}

async function init(): Promise<Repo> {
  if (env.dataBackend === "supabase") return createRepo(supabaseRpc());
  if (env.isHosted) throw new Error("Local database backend is not allowed on hosted deployments");

  const { createLocalDb } = await import("./pglite");
  const dataDir = process.env.LOCAL_DB_DIR ?? path.resolve(process.cwd(), ".data/pglite");
  const db = await createLocalDb({ dataDir, seed: true });
  return createRepo(pgRpc(db));
}

function supabaseRpc(): Rpc {
  const client = createClient(env.supabaseUrl(), env.supabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return async (fn, args) => {
    const { data, error } = await client.rpc(fn, args);
    // Only the error code: Postgres messages can echo row values (PII).
    if (error) throw new Error(`rpc ${fn} failed (${error.code ?? "unknown"})`);
    return data;
  };
}
