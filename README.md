# StemCycle Pickup

Live address (once deployed): **https://ftcoverdrive.org/STEM**. It's served by the team
site's Cloudflare Worker, which forwards `/STEM` to this app on Vercel (see
"Serving at ftcoverdrive.org/STEM" below).

Residents in Frisco, Plano, McKinney and nearby cities book a free weekend doorstep
pickup of used textbooks. Volunteer drivers say when they're free, and the app builds
their routes automatically.

| Who | Where | What |
|---|---|---|
| Residents | `/`, `/contact` | Book a 1-hour Saturday/Sunday slot (only hours a driver is free), get a confirmation email with a cancel link. No account. Contact Us form. |
| Drivers | invite link → `/signup`; `/login` (footer: "Volunteer sign in"); `/driver` | Sign up by invitation, wait for approval, set weekend hours, follow their route: every stop in order, **Open route in Google Maps**, "Mark picked up" (works offline). |
| Admin | `/admin/login` (not linked publicly) | One shared login. Pickups (filters, CSV), drivers (approve, capacity, invite link), routes (map, unassigned, reassign, re-run, Google Maps link), settings (depot). |

**Driver access.** The public site doesn't advertise driver sign-up. With
`DRIVER_INVITE_CODE` set, `/signup` and its API only accept the invite link shown on
**Admin → Drivers** (`/signup?invite=…`); anyone else sees "sign-up is by invitation".
Every new account is still inactive until the admin approves it (enforced in the
database, not just the UI). Changing the code retires old links.

**Google Maps hand-off.** Each route has **Open route in Google Maps**: depot, every
stop in the listed order, back to the depot, using Google's keyless Maps URLs. Google
takes 9 stops between start and end per link, so longer routes become numbered parts
("Part 1 of 3: Depot → Stop 10", "Part 2: Stop 10 → Stop 20", …), each starting where
the last ended. Mid-route, drivers also get **Continue from my location** through the
stops they haven't picked up (Google uses the phone's location; the app never asks for
it). Cancelled stops are left out and the page says so. No Google API key is needed;
the on-page map uses OpenStreetMap.

**Contact Us.** `/contact` shows the contact address and a form that emails the message
to it (reply-to: the sender) through the app's mailer. The address is `CONTACT_EMAIL`,
else the reply-to address in Settings, else `EMAIL_FROM`. It's protected by
validation, Turnstile, a honeypot and rate limits. The form only says "sent" if the
email really went out; otherwise it shows the address to write to.

## How it works

```
Browser ─► Next.js on Vercel (apps/web) ─► Supabase Postgres + Auth (RLS; rules in SQL functions)
               ├─► Nominatim             geocoding (free, 1 req/s, cached by address hash)
               ├─► OpenRouteService/OSRM road travel times + route lines
               ├─► OR-Tools on Render    services/solver (gets numbers only, never addresses)
               ├─► Gmail SMTP or Resend  emails
               └─► Cloudflare Turnstile  spam check on public forms
pg_cron (in Supabase) ─► /api/internal/routing/tick, only when a weekend needs work
```

**Routing.** A weekend is planned per day. Each run of a driver's consecutive hours
(e.g. Sat 10–1) becomes a vehicle that leaves the depot at the start and must be back
within the return buffer (45 min) after the end. Each pickup is a stop that must be
served inside its 1-hour slot, by a driver free that hour, within vehicle capacity
(books ÷ 20 = boxes) and max route length. OR-Tools solves it; if the solver is
asleep or down, a nearest-neighbour + 2-opt planner does. Pickups that can't be placed
are marked **unassigned** with the reason.

**Automatic re-runs.** Bookings, cancellations, availability, capacity, location and
settings changes mark the weekend "dirty". When a weekend has had no changes for
2 minutes, it is re-planned once. On the Friday before (6 PM by default) the weekend
**locks**: bookings and availability close, a final plan runs, and each driver gets
an email. After that only the admin changes routes, and affected drivers are emailed.

**Admin overrides.** On the Routes page the admin can assign a stop to a specific
driver. The assignment sticks through later re-runs.

```
apps/web/              Next.js 16 app (pages, API, UI)
  lib/routing/         plan (problem builder), fallback solver, scheduler, matrix
  tests/               unit/ db/ integration/ (Vitest) and e2e/ (Playwright + axe)
services/solver/       FastAPI + OR-Tools (Docker; deployed by render.yaml)
supabase/migrations/   schema, RLS, SQL functions (run in order)
supabase/cron.sql      pg_cron schedule (run once after deploying)
supabase/seed.sql      optional: a demo depot
```

Why not Vite + Cloudflare: OR-Tools needs Python (not Workers). D1 has no row-level
security. Supabase gives hashed-password auth and pg_cron for free.

## Local development

You need Node 20 or newer. The solver is optional and needs Python 3.12 or newer.

```bash
cd apps/web
npm install
cp .env.example .env.local
npm run dev                     # http://localhost:3000
```

- **Data:** an embedded Postgres (PGlite) in `apps/web/.data/pglite`, seeded with a
  depot and drivers Dana and Sam (with hours on the next four weekends) plus Pat (pending).
  To reset, delete the folder.
- **Signing in:** `/login` has **Sign in as Admin / Dana / Sam / Pat** buttons (local only).
  Driver sign-up is at `/signup` (or `/signup?invite=…` if `DRIVER_INVITE_CODE` is set).
  The admin login form also works with `admin@stemcycle.local` / `stemcycle-admin`.
- **Email:** messages are written to `apps/web/.data/outbox/` instead of being sent.
- **Routing:** a timer inside the dev server does the pg_cron job (every 30 s).
  `GEOCODER=fake` and `ROUTING_PROVIDER=fake` work offline with made-up coordinates
  and travel times.
- **Solver (optional):**
  ```bash
  cd services/solver
  python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
  SOLVER_SECRET=dev .venv/bin/uvicorn app:app --port 8000
  # then in apps/web/.env.local: SOLVER_URL=http://localhost:8000  SOLVER_SECRET=dev
  ```

### Tests

```bash
cd apps/web
npm run lint && npm run typecheck
npm test                          # unit + database (PGlite)
npx playwright install chromium   # first time only
npm run test:e2e                  # builds the app; phone + desktop, axe, PII leak check
cd ../../services/solver && .venv/bin/python -m pytest -q
```

The e2e teardown fails the run if any test resident's name, email, phone or street
appears in a server log line or a browser request URL. CI runs everything on each push.

## Deploying (free tiers)

Keep every secret in the hosting dashboards, never in git.

1. **GitHub.** Push this folder to a private repository.
2. **Supabase** (https://supabase.com, region *US East/Central*):
   1. In **SQL Editor**, run `supabase/migrations/0001…0006` in order. Optionally run `seed.sql`.
   2. Under **Authentication → Sign In / Providers → Email**, turn **off** "Allow new
      users to sign up". The app creates driver accounts itself.
   3. Under **Authentication → URL Configuration**, set Site URL to `https://<your-app>.vercel.app`.
   4. Under **Integrations**, enable **pg_cron** and **pg_net** (the next step can also create them).
   5. From **Project Settings → API**, copy the URL, the `anon` key and the `service_role` key.
3. **Render** (https://render.com): **New → Blueprint**, then pick the repo. This creates
   `stemcycle-solver` from `render.yaml`. Copy its URL and the generated `SOLVER_SECRET`.
4. **Free keys:**
   - OpenRouteService key: https://openrouteservice.org/dev/#/signup
   - Cloudflare Turnstile site and secret keys: dash.cloudflare.com → Turnstile
   - A Gmail App Password: needs 2-Step Verification; create it at
     https://myaccount.google.com/apppasswords
5. **Admin password hash:** `node apps/web/scripts/hash-admin-password.mjs`. It prompts
   for the password and prints `ADMIN_PASSWORD_HASH=…`.
6. **Vercel** (https://vercel.com): **Add New → Project**, set **Root Directory** to
   `apps/web`, then add these environment variables:

   | Variable | Value |
   |---|---|
   | `APP_URL` | `https://ftcoverdrive.org/STEM` |
   | `NEXT_PUBLIC_BASE_PATH` | `/STEM` |
   | `PROXY_SECRET` | `openssl rand -hex 32` (same value as the team site's `STEMCYCLE_PROXY_SECRET`) |
   | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | from Supabase |
   | `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` | the shared admin login |
   | `ADMIN_SESSION_SECRET`, `RATE_LIMIT_SALT`, `CRON_SECRET` | each `openssl rand -hex 32` |
   | `DRIVER_INVITE_CODE` | `openssl rand -hex 12` (makes sign-up invite-only) |
   | `CONTACT_EMAIL` (optional) | inbox for Contact Us; defaults to `EMAIL_FROM` |
   | `EMAIL_PROVIDER` = `smtp`, `EMAIL_FROM`, `SMTP_USER` | the sending Gmail address |
   | `SMTP_PASS` (`SMTP_HOST`/`SMTP_PORT` default to Gmail 465) | the App Password |
   | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | from Cloudflare |
   | `ORS_API_KEY` | from OpenRouteService |
   | `SOLVER_URL`, `SOLVER_SECRET` | from Render |

7. **Serving at ftcoverdrive.org/STEM.** The team site
   (`kavinjaganathan/OverdriveFTC17294-Website`, a Cloudflare Worker) has a
   `stemcycle` branch that adds a "StemCycle" tab and a `worker.js` proxy for `/STEM`.
   1. Merge it: https://github.com/kavinjaganathan/OverdriveFTC17294-Website/pull/new/stemcycle
   2. In `wrangler.jsonc`, set `STEMCYCLE_ORIGIN` to the Vercel URL (e.g.
      `https://stemcycle-pickup.vercel.app`). While it's empty, `/STEM` shows "not
      available yet".
   3. Add the secret: `npx wrangler secret put STEMCYCLE_PROXY_SECRET` (the same value
      as `PROXY_SECRET`), then deploy the team site as usual (`npx wrangler deploy`).

   The proxy keeps visitors on ftcoverdrive.org, passes the visitor's IP (trusted
   only with the shared secret) so rate limits work, and rewrites redirects.
   Add `ftcoverdrive.org` to the Turnstile site's hostnames, and set Supabase's Site
   URL to `https://ftcoverdrive.org/STEM`.
8. **Automatic routing:** in Supabase's SQL Editor, open `supabase/cron.sql`, replace
   the app URL and `CRON_SECRET`, and run it once. Every minute it checks inside the
   database whether any weekend needs work, and only then calls the app. Vercel's
   daily cron (`vercel.json`) also runs data retention, geocoding retries and a
   routing tick as a backup, and keeps the free Supabase project from pausing.
9. **Deploy from the command line instead (optional):**
   ```bash
   npm i -g vercel && cd apps/web
   vercel link              # pick or create the project; root is apps/web
   vercel env pull          # optional: check the variables you set
   vercel --prod            # builds with `next build` and deploys
   ```
10. **Smoke test:**
   1. `https://ftcoverdrive.org/STEM/api/health` returns `{"status":"ok"}`.
   2. Sign in at `/STEM/admin/login` and set the depot (**Settings → Find coordinates**).
   3. Copy the invite link from **Drivers**, sign up a test driver with it, approve them, and add their hours.
   4. Book a pickup at `/` in one of those hours.
   5. About 2–3 minutes later, the route appears under **Routes** and on the driver's phone.
      Tap **Open route in Google Maps** and check the stops match the list.
   6. Send a message from `/contact` and check it arrives.

**Changing the sending email:** update `EMAIL_FROM`, `SMTP_USER` and `SMTP_PASS` in
Vercel and redeploy. No code changes are needed. All emails, including password
resets, go through this account.
**Changing the admin password:** generate a new hash, update `ADMIN_PASSWORD_HASH`,
and redeploy. Existing admin sessions end.

## Privacy and security

- **Access**
  - HTTPS only (HSTS).
  - Admin pages and APIs need the signed admin cookie: 12-hour sessions, bound to the
    current credentials. Admin logins are rate limited per IP and globally.
  - Drivers read data only through SQL functions that filter to their own routes.
    Route tables have no direct-read policies. Drivers never see resident emails.
  - New driver accounts can't do anything until the admin approves them.
- **Passwords**
  - Driver passwords are bcrypt (Supabase Auth); the admin password is scrypt.
  - Sign-up gives the same answer for existing emails, so it can't be used to probe accounts.
- **No PII in URLs or logs**
  - Cancel links are 256-bit tokens (only the hash is stored), and the cancel page
    sends no Referer.
  - The logger redacts personal fields; a static test and the e2e teardown enforce it.
- **Public forms:** Turnstile, a honeypot field, per-IP and per-email rate limits
  (salted hashes), and Zod validation on both client and server.
- **Third parties**
  - Nominatim sees addresses.
  - ORS/OSRM see coordinates only.
  - The solver sees numbers only.
- **Retention:** personal details are erased `retention_days` (90) after the pickup
  date. City, ZIP, textbook type and book count are kept for impact numbers.

## Costs and limits

Everything runs on free tiers:

| Service | Free limit |
|---|---|
| Supabase | 500 MB |
| Render | sleeps when idle; the first plan of the day may use the fallback |
| ORS | 2,000 requests a day |
| Gmail | about 500 emails a day |
| Nominatim | 1 request per second |

**Vercel Hobby** is for non-commercial use. Check that StemCycle qualifies; the app
also runs on any Node host with the same environment variables.
