import "server-only";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

/** Repo root (apps/web -> ../..). */
const ROOT = path.resolve(process.cwd(), "../..");
// Local-only files; keep them out of production output tracing.
const read = (rel: string) =>
  fs.readFileSync(/*turbopackIgnore: true*/ path.join(ROOT, rel), "utf8");

function migrationFiles(): string[] {
  return fs
    .readdirSync(/*turbopackIgnore: true*/ path.join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/**
 * Opens (or creates) a local database and applies any migrations it hasn't
 * seen yet. The dev seed only runs when the database is first created.
 */
export async function createLocalDb(opts: { dataDir?: string; seed?: boolean } = {}) {
  if (opts.dataDir) fs.mkdirSync(path.dirname(opts.dataDir), { recursive: true });
  const db = new PGlite(opts.dataDir);
  await db.exec(read("supabase/local/bootstrap.sql"));
  await db.exec("create table if not exists local_migrations (name text primary key)");
  const applied = new Set(
    (await db.query<{ name: string }>("select name from local_migrations")).rows.map((r) => r.name),
  );
  const fresh = applied.size === 0;
  if (
    fresh &&
    (await db.query("select 1 from pg_tables where tablename = 'pickups'")).rows.length
  ) {
    throw new Error(
      "This local database predates migration tracking. Delete apps/web/.data/pglite and restart.",
    );
  }
  for (const file of migrationFiles()) {
    if (applied.has(file)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(read(`supabase/migrations/${file}`));
      await tx.query("insert into local_migrations (name) values ($1)", [file]);
    });
  }
  if (fresh && opts.seed) {
    await db.exec(read("supabase/local/dev-users.sql"));
    await db.exec(read("supabase/seed.sql"));
  }
  return db;
}
