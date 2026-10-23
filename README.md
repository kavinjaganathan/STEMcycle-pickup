# StemCycle Pickup

A web app for StemCycle's textbook drive. Residents in Frisco, Plano, McKinney and
nearby cities book a free doorstep pickup. Admins plan optimized driver routes.
Volunteer drivers follow their route on their phones.

| Who | Where | What |
|---|---|---|
| Residents | `/` | Book a pickup (no account), get a confirmation email, cancel from the emailed link |
| Admins | `/admin` | Pickups (filter, update, CSV export), pickup windows, vehicles, depots, team, settings, route planner |
| Drivers | `/driver` | Their own stop list with ETAs, Google/Apple Maps links, a "picked up" button, and offline sync |

## How it fits together

```
Browser ──► Next.js on Vercel (apps/web) ──► Supabase Postgres + Auth (RLS on every table)
                 │
                 ├─► Nominatim (geocoding)            free, 1 req/s, cached
                 ├─► OpenRouteService / OSRM           road travel times + route lines
                 ├─► OR-Tools solver on Render         (services/solver), receives numbers only
                 ├─► Gmail SMTP or Resend              confirmation emails
                 └─► Cloudflare Turnstile              spam check on the public form
```

```
apps/web/              Next.js 16 app (UI + API)
  app/                 pages, layouts and API route handlers
  components/          UI (admin/, driver/, map/)
  lib/                 db access, auth, validation, email, geocoding, routing/
  tests/               unit/ db/ integration/ (Vitest) and e2e/ (Playwright + axe)
services/solver/       FastAPI + OR-Tools route solver (Docker, deployed via render.yaml)
supabase/migrations/   schema, row-level security and SQL functions (run in order)
supabase/seed.sql      optional demo data (windows, a depot, two SUVs)
```

All business rules live in SQL functions: slot capacity, cancelling, rate limits,
admin/driver permissions, publishing routes and data retention. Locally the same
migrations run in an embedded Postgres (PGlite), so development and tests need no
cloud accounts.

## Local development

You need Node 20 or newer. For the solver (optional), you need Python 3.12 or newer.

```bash
cd apps/web
npm install
cp .env.example .env.local
npm run dev                     # http://localhost:3000
```

- **Signing in:** open `/login` and choose **Sign in as Alex Admin / Dana Driver /
  Sam Driver**. This works only with the local database and is disabled on any
  hosted deployment.
- **Emails** are written to `apps/web/.data/outbox/` instead of being sent.
- **Resetting the database:** delete `apps/web/.data/pglite`.
- **Working offline:** `GEOCODER=fake` and `ROUTING_PROVIDER=fake` use made-up
  coordinates and travel times (local only).
- **Solver (optional):**

  ```bash
  cd services/solver
  python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
  SOLVER_SECRET=dev .venv/bin/uvicorn app:app --port 8000
  # then add to apps/web/.env.local:  SOLVER_URL=http://localhost:8000   SOLVER_SECRET=dev
  ```

  Without it, the route planner uses its built-in fallback.

### Tests

```bash
cd apps/web
npm run lint && npm run typecheck
npm test                                    # unit + database tests (PGlite)
npx playwright install chromium             # first time only
npm run test:e2e                            # builds the app; browser tests on phone + desktop
cd ../../services/solver && .venv/bin/python -m pytest -q
```

The end-to-end suite also checks:
- accessibility with axe on every page;
- no horizontal scrolling on phones;
- security headers;
- that **no test resident's name, email, phone or street appears in any server log
  line or browser request URL** (`tests/e2e/teardown.ts`).

CI runs all of this on every push (`.github/workflows/ci.yml`).

## Deploying (all free tiers)

Do these in order. Keep every secret in the hosting dashboards, never in git.

### 0. Put the code on GitHub

Vercel and Render deploy from a GitHub repository. Create a private repo and push
this folder to it.

### 1. Supabase (database + logins)

1. **Create the project.** At https://supabase.com, create a project (region:
   *East US* or *Central US*). Save the database password.
2. **Run the migrations.** In **SQL Editor**, run each file in
   `supabase/migrations/` in order (`0001` … `0006`). Optionally run
   `supabase/seed.sql` for demo windows, a depot and two SUVs; you can also add
   these in the app.
3. **Lock down sign-ups.** Under **Authentication → Sign In / Providers → Email**,
   turn **off** "Allow new users to sign up". Admins add people from the app.
4. **Set the URLs.** Under **Authentication → URL Configuration**:
   - Site URL: `https://<your-app>.vercel.app`
   - Redirect URLs: `https://<your-app>.vercel.app/auth/callback`
5. **Send sign-in links through your email account.** Under **Authentication →
   Emails → SMTP Settings**, enable custom SMTP:
   - Host `smtp.gmail.com`, port `465`
   - Username: your Gmail address
   - Password: a Gmail App Password (see step 4 below)

   Supabase's built-in email is limited to a few messages per hour.
6. **Create the first admin.** Under **Authentication → Users → Add user**, enter
   your email and a password, and tick *Auto confirm*. Then run in the SQL Editor:

   ```sql
   update profiles set role = 'admin', active = true, full_name = 'Your Name'
   where id = (select id from auth.users where email = 'you@example.org');
   ```

7. **Copy the keys.** From **Project Settings → API**, copy the Project URL, the
   `anon` key and the `service_role` key. The service role key is secret and
   server-only.

### 2. Render (route solver)

1. At https://render.com, choose **New → Blueprint**, pick the repo, and apply
   `render.yaml`. This creates `stemcycle-solver` on the free plan and generates
   `SOLVER_SECRET`.
2. Copy the service URL (`https://stemcycle-solver-xxxx.onrender.com`) and the
   generated `SOLVER_SECRET`.

The free plan sleeps after 15 minutes idle, so the first route plan of the day can
take about a minute while it wakes up. If it's still waking after 90 seconds, the
app uses the fallback planner and says so. Re-plan a minute later for the optimized
result.

### 3. Other free keys

- **OpenRouteService:** sign up at https://openrouteservice.org/dev/#/signup and
  copy the API key (2,000 requests a day).
- **Cloudflare Turnstile:** go to https://dash.cloudflare.com → **Turnstile → Add
  site**, enter your Vercel domain, and copy the site key and the secret key.

### 4. Gmail App Password (confirmation emails)

1. Turn on 2-Step Verification for the sending Google account.
2. Create an App Password at https://myaccount.google.com/apppasswords.

Gmail allows about 500 emails a day.

### 5. Vercel (the web app)

1. At https://vercel.com, choose **Add New → Project**, pick the repo, and set
   **Root Directory** to `apps/web`.
2. Add these **Environment Variables** for Production:

   | Variable | Value |
   |---|---|
   | `APP_URL` | `https://<your-app>.vercel.app` (or your custom domain) |
   | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | from Supabase |
   | `EMAIL_PROVIDER` | `smtp` |
   | `EMAIL_FROM`, `SMTP_USER` | the sending Gmail address |
   | `SMTP_PASS` | the Gmail App Password |
   | `SMTP_HOST`, `SMTP_PORT` | `smtp.gmail.com`, `465` |
   | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | from Cloudflare |
   | `ORS_API_KEY` | from OpenRouteService |
   | `SOLVER_URL`, `SOLVER_SECRET` | from Render |
   | `RATE_LIMIT_SALT` | output of `openssl rand -hex 32` |
   | `CRON_SECRET` | output of `openssl rand -hex 32` |
   | `NOMINATIM_CONTACT_EMAIL` | optional; defaults to `EMAIL_FROM` |

3. Deploy. `vercel.json` schedules `/api/cron/daily` once a day. It does three
   things:
   - deletes personal details of pickups older than the retention period;
   - retries any addresses that couldn't be located;
   - touches the database, which stops the free Supabase project from pausing
     after 7 days.

### 6. Smoke test

1. Open `https://<your-app>/api/health`. It should return `{"status":"ok"}`.
2. Book a pickup on `/` with your own address. The confirmation email should arrive,
   and the cancel link should work.
3. Sign in at `/login`. Add a depot (use **Find coordinates**) and check the
   vehicles. Add a driver under **Team**; they get a one-time temporary password.
4. Plan routes for a day with pickups and publish them. Sign in as the driver on a
   phone.

### Changing the sending email later

Update `EMAIL_FROM`, `SMTP_USER` and `SMTP_PASS` in Vercel and redeploy. Update the
SMTP settings in Supabase too, since they send the sign-in links. No code changes
are needed. If you get a domain, you can switch to `EMAIL_PROVIDER=resend`.

## Privacy and security

- **Access**
  - HTTPS only (HSTS).
  - Admin and driver data is protected by Postgres row-level security as well as
    API checks.
  - Drivers see only their own published routes, without residents' emails.
  - New accounts start inactive; only admins activate people.
- **No PII in URLs or logs**
  - Cancel links use 256-bit random tokens; only the hash is stored. Tokens travel
    in POST bodies.
  - The cancel page sends no Referer.
  - The logger redacts personal fields, a static test forbids logging them, and
    the e2e teardown scans real server logs and URLs.
- **Public form**
  - Turnstile, a honeypot field, rate limits (5 requests per IP per 10 minutes,
    3 per email per day, stored as salted hashes), and Zod validation on client
    and server.
  - Logins and sign-in links are rate-limited too.
- **Headers**
  - Strict CSP limited to Turnstile and OpenStreetMap tiles.
  - `frame-ancestors 'none'`, nosniff, COOP.
  - Cross-site API writes are rejected.
- **Third parties**
  - Nominatim receives addresses, over HTTPS, to look up coordinates.
  - OpenRouteService and OSRM receive coordinates only.
  - The solver receives travel-time numbers only.
- **Retention:** names, emails, phones, addresses and notes are erased from
  completed or cancelled pickups after `retention_days` (default 90, editable in
  Settings). City, ZIP and book count are kept for impact numbers.
- **Audit log:** status changes, publishes, settings edits and team changes are
  recorded in `audit_log` with user IDs only.

## Costs and limits

Everything above runs on free tiers. Limits to keep in mind:
- Supabase: 500 MB database, and the project pauses after 7 days idle (the daily
  job prevents this).
- Render: the free solver sleeps when idle.
- OpenRouteService: 2,000 matrix and route requests a day. One plan uses about
  1–10 requests.
- Gmail: about 500 emails a day.
- Nominatim: 1 request per second.

The app is sized for up to roughly 150 stops a day. Beyond that, consider
self-hosting OSRM or upgrading Render ($7/mo) so the solver doesn't sleep.

**Vercel Hobby** is intended for personal, non-commercial use. Check whether
StemCycle qualifies, or ask Vercel about nonprofit sponsorship. The app also runs
on any Node host (for example Render or Netlify) with the same environment
variables.
