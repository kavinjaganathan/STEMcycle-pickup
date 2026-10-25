import "server-only";

/**
 * Server configuration, read from environment variables. Everything that may
 * change after launch (sender address, SMTP account, keys) lives here so it
 * can be changed in the Vercel dashboard without touching code.
 */
export const env = {
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
  get isHosted() {
    return Boolean(process.env.VERCEL);
  },
  get appUrl() {
    return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  },
  get dataBackend(): "supabase" | "local" {
    const explicit = process.env.DATA_BACKEND;
    if (explicit === "supabase" || explicit === "local") return explicit;
    return process.env.SUPABASE_URL ? "supabase" : "local";
  },
  supabaseUrl: () => required("SUPABASE_URL"),
  supabaseServiceKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  supabaseAnonKey: () => required("SUPABASE_ANON_KEY"),

  get emailProvider(): "smtp" | "resend" | "file" {
    const p = process.env.EMAIL_PROVIDER;
    if (p === "smtp" || p === "resend" || p === "file") return p;
    return this.isProd ? "smtp" : "file";
  },
  emailFrom: () => required("EMAIL_FROM"),

  get turnstileSecret() {
    return process.env.TURNSTILE_SECRET_KEY ?? "";
  },
  /** The single shared admin login. Locally it defaults to a dev account. */
  get adminEmail(): string {
    const v = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (v) return v;
    if (this.isHosted) throw new Error("ADMIN_EMAIL is not set");
    return "admin@stemcycle.local";
  },
  /** scrypt hash from scripts/hash-admin-password.mjs; null = use the local dev password. */
  get adminPasswordHash(): string | null {
    const v = process.env.ADMIN_PASSWORD_HASH?.trim();
    if (v) return v;
    if (this.isHosted) throw new Error("ADMIN_PASSWORD_HASH is not set");
    return null;
  },
  get adminSessionSecret(): string {
    const v = process.env.ADMIN_SESSION_SECRET;
    if (v && v.length >= 32) return v;
    if (this.isHosted) throw new Error("ADMIN_SESSION_SECRET must be at least 32 characters");
    return "local-dev-admin-session-secret-not-for-production";
  },
  get rateLimitSalt() {
    const salt = process.env.RATE_LIMIT_SALT;
    if (salt) return salt;
    if (this.isHosted) throw new Error("RATE_LIMIT_SALT is not set");
    return "local-dev-salt";
  },
};

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}
