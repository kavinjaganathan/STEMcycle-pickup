-- StemCycle Pickup: automatic routing schedule (run ONCE in the Supabase SQL
-- editor after the app is deployed). Not a migration: it needs your app URL
-- and CRON_SECRET, and must not run against the local PGlite database.
--
-- Every minute, pg_cron checks (inside the database, for free) whether any
-- weekend needs re-planning or locking. Only then does pg_net call the app's
-- routing tick, so an idle week costs no function invocations.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1. Store the secret in Supabase Vault (replace the value with your CRON_SECRET).
select vault.create_secret('REPLACE_WITH_CRON_SECRET', 'stemcycle_cron_secret');

-- 2. Every minute: re-plan weekends that need it (only calls the app when there's work).
select cron.schedule(
  'stemcycle-routing-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://ftcoverdrive.org/STEM/api/internal/routing/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                     where name = 'stemcycle_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  where public.routing_work_due(120);
  $$
);

-- 3. Daily job (10:00 UTC): data retention, geocoding retries, a backup routing
--    tick, and activity that keeps the free Supabase project from pausing.
select cron.schedule(
  'stemcycle-daily',
  '0 10 * * *',
  $$
  select net.http_get(
    url := 'https://ftcoverdrive.org/STEM/api/cron/daily',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                     where name = 'stemcycle_cron_secret')),
    timeout_milliseconds := 120000
  );
  $$
);

-- To check it's running:   select * from cron.job_run_details order by start_time desc limit 5;
-- To change the secret:    select vault.update_secret(id, 'NEW_SECRET') from vault.secrets where name = 'stemcycle_cron_secret';
-- To stop it:              select cron.unschedule('stemcycle-routing-tick');
