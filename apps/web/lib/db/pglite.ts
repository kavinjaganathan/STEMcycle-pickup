import "server-only";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

/** Repo root (apps/web -> ../..). */
const ROOT = path.resolve(process.cwd(), "../..");

export function migrationSql(): string[] {
  const dir = path.join(ROOT, "supabase/migrations");
  return [
    fs.readFileSync(path.join(ROOT, "supabase/local/bootstrap.sql"), "utf8"),
    ...fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => fs.readFileSync(path.join(dir, f), "utf8")),
  ];
}

export function seedSql(): string[] {
  return [
    fs.readFileSync(path.join(ROOT, "supabase/local/dev-users.sql"), "utf8"),
    fs.readFileSync(path.join(ROOT, "supabase/seed.sql"), "utf8"),
  ];
}

/** Fresh database with all migrations applied (and optionally the dev seed). */
export async function createLocalDb(opts: { dataDir?: string; seed?: boolean } = {}) {
  const fresh = !opts.dataDir || !fs.existsSync(path.join(opts.dataDir, "PG_VERSION"));
  if (opts.dataDir) fs.mkdirSync(path.dirname(opts.dataDir), { recursive: true });
  const db = new PGlite(opts.dataDir);
  if (fresh) {
    for (const sql of migrationSql()) await db.exec(sql);
    if (opts.seed) for (const sql of seedSql()) await db.exec(sql);
  }
  return db;
}
