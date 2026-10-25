// Cloudflare build only (see next.config.ts): the embedded local database is
// for development and tests, and production uses Supabase. Keeps ~8 MB of
// WebAssembly out of the Worker.
export class PGlite {
  constructor() {
    throw new Error("The local database isn't available in the Cloudflare build");
  }
}
