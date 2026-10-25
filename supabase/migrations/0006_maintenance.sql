-- StemCycle Pickup: data retention and health

-- Daily maintenance (service role only):
--  * strips personal details from pickups older than the retention period
--    (keeps city, ZIP, textbook type and book count for impact stats)
--  * removes old rate-limit counters, availability, superseded plans and stale geocode cache
create function run_maintenance(p_now timestamptz default now()) returns jsonb
language plpgsql as $$
declare
  v_cutoff date := (p_now at time zone org_tz())::date
                   - (select retention_days from settings where id);
  v_anon int;
  v_plans int;
begin
  update pickups set
    name = 'Removed', email = '', phone = '', address_line = '', notes = null,
    lat = null, lng = null, cancel_token_hash = 'anonymized:' || id::text,
    anonymized_at = p_now
  where slot_date < v_cutoff and anonymized_at is null;
  get diagnostics v_anon = row_count;

  delete from route_plans where status = 'superseded' and plan_date < v_cutoff;
  get diagnostics v_plans = row_count;

  delete from driver_hours where avail_date < v_cutoff;
  delete from rate_limits where window_start < p_now - interval '1 day';
  delete from geocode_cache where created_at < p_now - interval '365 days';

  insert into audit_log (action, entity) values ('maintenance', 'system');
  return jsonb_build_object('anonymized', v_anon, 'plans_removed', v_plans);
end;
$$;

-- Lightweight database ping for /api/health and the daily keep-alive.
create function health_check() returns boolean language sql stable as $$ select true $$;

select apply_grants();
