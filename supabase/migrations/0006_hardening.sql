-- StemCycle Pickup: hardening (Phase 6)

-- Accounts created outside the admin "Add person" flow (e.g. a public sign-up
-- left enabled by mistake) start inactive and get no access.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, role, full_name, active) values (new.id, 'driver', '', false)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Daily maintenance (service role only):
--  * strips personal details from pickups older than the retention period
--    (keeps city, ZIP and book count for impact stats)
--  * removes old rate-limit counters, superseded plans and stale geocode cache
create function run_maintenance(p_now timestamptz default now()) returns jsonb
language plpgsql as $$
declare
  v_days int := (select retention_days from settings where id);
  v_cutoff date := (p_now at time zone (select timezone from settings where id))::date - v_days;
  v_anon int;
  v_plans int;
begin
  update pickups p set
    name = 'Removed', email = '', phone = '', address_line = '', notes = null,
    lat = null, lng = null, cancel_token_hash = 'anonymized:' || p.id::text,
    anonymized_at = p_now
  from slots s
  where s.id = p.slot_id and s.slot_date < v_cutoff and p.anonymized_at is null;
  get diagnostics v_anon = row_count;

  delete from route_plans rp
  where rp.status = 'superseded' and rp.plan_date < v_cutoff;
  get diagnostics v_plans = row_count;

  delete from rate_limits where window_start < p_now - interval '1 day';
  delete from geocode_cache where created_at < p_now - interval '365 days';

  insert into audit_log (action, entity) values ('maintenance', 'system');
  return jsonb_build_object('anonymized', v_anon, 'plans_removed', v_plans);
end;
$$;

-- Lightweight database ping for /api/health and the daily keep-alive.
create function health_check() returns boolean language sql stable as $$ select true $$;

revoke execute on function run_maintenance(timestamptz), health_check() from public, anon, authenticated;
grant execute on function run_maintenance(timestamptz), health_check() to service_role;
