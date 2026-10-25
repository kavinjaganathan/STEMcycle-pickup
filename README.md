# StemCycle Pickup

Address: **https://ftcoverdrive.org/STEM**. Everything runs on Cloudflare: this app is
the Worker `stemcycle-pickup`, and the team site's Worker
(`kavinjaganathan/OverdriveFTC17294-Website`) hands it every `/STEM` request through a
service binding. The app has no other public address.

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
Browser ─► ftcoverdrive.org (team-site Worker) ─/STEM─► stemcycle-pickup Worker (Next.js via OpenNext)
               ─► Supabase Postgres + Auth (RLS; rules in SQL functions)
               ├─► Nominatim             geocoding (free, 1 req/s, cached by address hash)
               ├─► OpenRouteService/OSRM road travel times + route lines
               ├─► OR-Tools on Render    services/solver (gets numbers only, never addresses)
               ├─► Gmail SMTP            emails (Workers TCP sockets; lib/email/smtp-lite.ts)
               └─► Cloudflare Turnstile  spam check on public forms
pg_cron (in Supabase) ─► /STEM/api/internal/routing/tick (only when a weekend needs work)
                      ─► /STEM/api/cron/daily (retention, geocode retries)
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

## Deploying to Cloudflare

Keep every secret in Cloudflare/Supabase, never in git.

1. **Supabase** (the database and driver logins; free):
   1. Create a project (region *US East/Central*). In **SQL Editor**, run
      `supabase/migrations/0001…0006` in order, then optionally `seed.sql`.
   2. **Authentication → Sign In / Providers → Email**: turn **off** "Allow new users to
      sign up" (the app creates driver accounts itself).
   3. **Authentication → URL Configuration**: Site URL `https://ftcoverdrive.org/STEM`.
   4. **Project Settings → API**: copy the URL, the `anon` key and the `service_role` key.
2. **Keys you create once:**
   - **Gmail App Password** for `ftcoverdrive17294@gmail.com`: turn on 2-Step
     Verification, then go to https://myaccount.google.com/apppasswords.
   - **Turnstile** (Cloudflare dashboard → Turnstile → Add site, hostname
     `ftcoverdrive.org`): site key + secret key.
   - Admin password hash: `node apps/web/scripts/hash-admin-password.mjs`.
   - Optional: OpenRouteService key; OR-Tools solver on Render (`render.yaml`). Without
     them the app uses OSRM and its built-in planner.
3. **Deploy the app Worker** (from `apps/web`, after `npx wrangler login`):
   1. Put the public settings in `wrangler.jsonc` → `vars`: `SUPABASE_URL`,
      `ADMIN_EMAIL` (the rest are already filled in: `APP_URL`, base path, Gmail sender).
   2. Add each secret with `npx wrangler secret put NAME`:
      `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD_HASH`,
      `ADMIN_SESSION_SECRET`, `RATE_LIMIT_SALT`, `CRON_SECRET` (each
      `openssl rand -hex 32`), `DRIVER_INVITE_CODE` (`openssl rand -hex 12`),
      `SMTP_PASS` (the App Password), `TURNSTILE_SECRET_KEY`, and optionally
      `ORS_API_KEY`, `SOLVER_SECRET`.
   3. Build and deploy. The Turnstile *site* key is public and gets built in:
      ```bash
      NEXT_PUBLIC_TURNSTILE_SITE_KEY=<site key> npm run cf:deploy
      ```
4. **Connect it to ftcoverdrive.org:** in the team site's `wrangler.jsonc`, uncomment
   `"services": [{ "binding": "STEMCYCLE", "service": "stemcycle-pickup" }]` and deploy
   the team site (`npx wrangler deploy`). Until then `/STEM` shows "not available yet".
5. **Automatic routing and the daily job:** open `supabase/cron.sql` in Supabase's SQL
   Editor, put in your `CRON_SECRET`, and run it once.
6. **Smoke test:**
   1. `https://ftcoverdrive.org/STEM/api/health` returns `{"status":"ok"}`.
   2. Sign in at `/STEM/admin/login` and set the depot (**Settings → Find coordinates**).
   3. Copy the invite link from **Drivers**, sign up a test driver with it, approve them,
      and add their hours.
   4. Book a pickup at `/STEM` in one of those hours; about 2–3 minutes later the route
      appears under **Routes** and on the driver's phone. Tap **Open route in Google
      Maps** and check the stops match the list.
   5. Send a message from `/STEM/contact` and check it arrives.

`npm run cf:preview` runs the Cloudflare build locally (Workers runtime). The local
PGlite database doesn't run there, so preview needs a Supabase project in `.dev.vars`.

**Changing the sending email:** update `EMAIL_FROM` and `SMTP_USER` in `wrangler.jsonc`
and the `SMTP_PASS` secret, then redeploy. No code changes are needed. All emails, including password
resets, go through this account.
**Changing the admin password:** generate a new hash and run
`npx wrangler secret put ADMIN_PASSWORD_HASH`. Existing admin sessions end.

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

| Service | Plan | Limit to know |
|---|---|---|
| Cloudflare Workers | Free, or Paid ($5/mo) | Free: 100k requests/day and **10 ms CPU per request**. Next.js page renders often need more, so pages may fail with error 1102 on the free plan; Workers Paid raises it to 30 s. |
| Supabase | Free | 500 MB; pauses after 7 idle days (the daily job prevents it) |
| Gmail | Free | about 500 emails a day |
| ORS / Nominatim | Free | 2,000 requests a day / 1 request per second |
| Render (optional solver) | Free | sleeps when idle; the built-in planner covers it |
