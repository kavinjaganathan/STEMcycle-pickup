import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Nonce-based CSP is incompatible with partial prerendering, so this follows
// Next's "without nonces" CSP and locks every external origin to what we use:
// Cloudflare Turnstile and OpenStreetMap tiles.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "font-src 'self'",
  "connect-src 'self' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Cross-origin requests get only the origin (never a path, so cancel tokens
  // can't leak); OSM's tile servers require at least that. The cancel page
  // itself sets no-referrer.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

// `npm run cf:build` sets this: the Cloudflare Worker build leaves out the
// local-only database and nodemailer (Workers use lib/email/smtp-lite.ts).
const cloudflare = process.env.DEPLOY_TARGET === "cloudflare";

// Served under a sub-path in production (ftcoverdrive.org/STEM); "" locally.
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  // Lets the e2e suite build a second copy (with the base path) side by side.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // Cache Components is off: it hangs on the Cloudflare Workers runtime. Pages
  // still opt into per-request rendering with connection() inside <Suspense>.
  poweredByHeader: false,
  // PGlite (local dev/test database) ships WASM; load it from node_modules.
  serverExternalPackages: cloudflare ? [] : ["@electric-sql/pglite"],
  // Never trace local data (test databases, email outbox) into a deployment.
  outputFileTracingExcludes: {
    "*": [".data/**", ".next-stem/**", ".open-next/**", ".wrangler/**"],
  },
  turbopack: {
    ...(cloudflare
      ? {
          resolveAlias: {
            "@electric-sql/pglite": "./lib/stubs/pglite.ts",
            nodemailer: "./lib/stubs/nodemailer.ts",
          },
        }
      : {}),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Under ftcoverdrive.org/STEM our robots.txt isn't the one crawlers read, so
      // private areas also say "noindex" on every response.
      {
        source: "/:area(admin|driver|login|signup|drive|cancel|api|auth)/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/:area(admin|driver|login|signup|drive)",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
