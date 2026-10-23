# StemCycle Pickup

Web app for scheduling doorstep pickups of used textbooks in Frisco, Plano, McKinney
and nearby cities. The books are donated to rural communities.

**Status:** Phase 1 of 6 is done: the resident request form, database, confirmation
emails and cancel links.

## Repo layout

```
apps/web/              Next.js 16 app (form, API, later admin + driver views)
  app/                 pages and API route handlers
  components/          UI components
  lib/                 db access, validation, email, security, logging
  tests/{unit,db,e2e}  Vitest + Playwright tests
supabase/
  migrations/          SQL schema, row-level security and business-rule functions
  seed.sql             dev seed (pickup slots for the next 14 days)
  local/bootstrap.sql  Supabase stand-ins for local PGlite only. Never run on Supabase.
```

## Local development

You need Node.js 20 or newer. Supabase, Docker and API keys are **not** needed
locally. The app runs the real SQL migrations in an embedded Postgres (PGlite)
stored in `apps/web/.data/`.

```bash
cd apps/web
npm install
cp .env.example .env.local   # then edit if needed
npm run dev                  # http://localhost:3000
```

- Emails are written to `apps/web/.data/outbox/*.json` while `EMAIL_PROVIDER=file`.
  Open the newest file to find the cancel link.
- To reset the local database, delete `apps/web/.data/pglite`.
- The Turnstile keys in `.env.example` are Cloudflare's always-pass test keys.

## Checks

```bash
npm run lint
npm run typecheck
npm test                       # unit + database tests (PGlite)
npx playwright install chromium   # first time only
npm run test:e2e               # builds the app and runs browser tests, incl. axe a11y checks
```

## Configuration

All settings live in environment variables. See `apps/web/.env.example`.

### Changing the sender email

The sender address isn't stored in code. To switch to a new address:

1. In Vercel → Project → Settings → Environment Variables, update `EMAIL_FROM`,
   plus `SMTP_USER` and `SMTP_PASS` for the new account.
2. Redeploy.

**Gmail:** turn on 2-Step Verification for the account. Then create an App Password
at https://myaccount.google.com/apppasswords and use it as `SMTP_PASS`, with
`EMAIL_PROVIDER=smtp`. Gmail allows about 500 emails a day.

**Own domain later:** set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and an
`EMAIL_FROM` on the verified domain.

### Service area

The ZIP allowlist is stored in the `settings` table, seeded with Frisco, Plano,
McKinney, Allen, Prosper, Little Elm, The Colony, Richardson and Carrollton ZIPs.
It will be editable from the admin dashboard in Phase 2.

## Privacy and security notes

- Addresses, emails and phone numbers are never logged. `lib/logger.ts` redacts
  PII as a backstop.
- Cancel links use a 256-bit random token. Only its SHA-256 hash is stored. The
  token is sent in a POST body and the site sets `Referrer-Policy: no-referrer`.
- Cancelling takes two steps (open the link, then confirm), so email link scanners
  can't cancel a pickup by opening the link.
- The public form has a honeypot field, Cloudflare Turnstile, and rate limits:
  5 requests per IP per 10 minutes and 3 per email per day. Rate-limit keys are
  salted hashes, never raw IPs.
- Row-level security: anonymous users and drivers can't read `pickups`. Public
  writes go through server-only SQL functions.

## Production setup

Phase 6 adds the full deployment guide for Vercel, Supabase and Render.
