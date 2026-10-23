# StemCycle Pickup

Web app for scheduling doorstep pickups of used textbooks in Frisco, Plano, McKinney
and nearby cities. The books are donated to rural communities.

**Status:** Phases 1–4 of 6 are done: the resident request form, emails and cancel
links, the admin dashboard, geocoding, and route planning.

## Repo layout

```
apps/web/              Next.js 16 app (public form, admin dashboard, driver view, API)
services/solver/       Python FastAPI + OR-Tools route solver (deployed to Render)
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
- **Signing in locally:** go to http://localhost:3000/login and pick a seeded user
  (Alex Admin, Dana Driver, Sam Driver). No passwords are needed locally. This
  shortcut is disabled whenever the app runs against Supabase or on Vercel.
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

## Admin dashboard (`/admin`)

| Page | What it does |
|---|---|
| Pickups | Filter by date range and status; mark pickups picked up, cancel or reopen them; export CSV (with spreadsheet formula-injection protection) |
| Windows | Add pickup windows in bulk (date range × weekdays × time), set capacity, close or delete windows |
| Vehicles | Add or edit vehicles: type (SUV by default), capacity in books, max route minutes, usual driver |
| Depots | Start and end locations for routes |
| Team | Add admins and drivers; change roles; deactivate people |
| Settings | Org name, timezone, service ZIPs, booking cutoff, email sender name and reply-to, data retention, route-planning timings |

**Sign-in in production** uses Supabase Auth: email and password, or an emailed
sign-in link. When an admin adds a person, the app creates their account and shows
a one-time temporary password for the admin to share privately.

**Access control** is enforced in three places:
1. Page guards.
2. API role checks.
3. The database itself. Admin SQL functions run as the signed-in user, check the
   admin role, and are covered by row-level security.

## Geocoding

Addresses are turned into map coordinates with the free
[Nominatim](https://nominatim.org) service from OpenStreetMap.

- **When it runs:** right after a request is submitted, in the background so the
  resident isn't kept waiting. Pickups that are still waiting are retried by the
  daily job and before route planning.
- **Rate limit:** at most 1 request per second, shared across all server instances
  through the `geocode_throttle` table. Results are cached in `geocode_cache`,
  keyed by a hash of the normalized address (the address text is not stored there).
- **Results:**
  - A house-number match inside the service area is `ok`.
  - A street-level or out-of-area match is flagged **Check location**.
  - No match is flagged **Location not found**.
  - For both flags, an admin clicks **Fix location** to correct the address or
    drop the pin on a map.
- **Testing and offline work:** set `GEOCODER=fake` (local only) for deterministic
  coordinates without network calls.
- **Contact address:** Nominatim's usage policy asks for a contact address in the
  User-Agent. Set `NOMINATIM_CONTACT_EMAIL`; it defaults to `EMAIL_FROM`.

## Route planning (`/admin/routes`)

1. **Choose the plan.** Pick a date, start and end depot, departure time, and which
   vehicles and drivers to use.
2. **Get travel times.** The app fetches real road travel times between every stop
   from **OpenRouteService** (needs a free `ORS_API_KEY`). If that fails it uses the
   public **OSRM** server. It never falls back to straight-line distance; if both
   fail it shows an error.
3. **Solve.** The problem goes to the **OR-Tools** service (`SOLVER_URL` +
   `SOLVER_SECRET`): a vehicle routing problem with time windows (the pickup
   windows), vehicle capacity (books) and max route duration. Service time per stop
   is set in Settings.
4. **Fallback.** If the solver is unreachable or returns something invalid, a
   built-in planner runs instead: nearest neighbour, then 2-opt, then cheapest
   insertion of leftover stops. It respects the same constraints, and the UI says
   which planner was used.
5. **Review and publish.** Each plan is saved as a **draft** with a map, stop order,
   ETAs, and the stops that couldn't be scheduled (with a reason). **Publish** makes
   it visible to drivers and marks those pickups *scheduled*. Publishing a newer plan
   replaces the old one.

The solver service receives only travel-time matrices and numbers, never addresses
or names.

**Running the solver locally:**

```bash
cd services/solver
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
SOLVER_SECRET=dev .venv/bin/uvicorn app:app --port 8000
# then in apps/web/.env.local: SOLVER_URL=http://localhost:8000  SOLVER_SECRET=dev
```

Without a solver, local planning uses the fallback. Set `ROUTING_PROVIDER=fake`
to plan with made-up travel times when offline (local only).

## Privacy and security notes

- Addresses go to Nominatim (over HTTPS) only to look up coordinates; they never
  appear in this app's own URLs.
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
