-- StemCycle Pickup: core schema
-- Runs on Supabase Postgres. Business rules live in SQL functions so the web app
-- (and local PGlite dev/test runs) share one implementation.
--
-- Pickups happen on weekends in 1-hour slots. A slot exists only while at least
-- one active driver has declared that hour available.

create type pickup_status as enum ('pending', 'scheduled', 'picked_up', 'cancelled');
create type geocode_status as enum ('pending', 'ok', 'needs_review', 'failed');
create type textbook_type as enum ('elementary', 'middle_school', 'high_school', 'college', 'other');
create type driver_status as enum ('pending', 'active', 'disabled');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Drivers. (The single admin login lives in environment variables, not here.)
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  capacity_boxes int not null default 10 check (capacity_boxes between 1 and 200),
  status driver_status not null default 'pending',
  created_at timestamptz not null default now()
);

-- Single-row org settings (id is always true).
create table settings (
  id boolean primary key default true check (id),
  org_name text not null default 'StemCycle',
  timezone text not null default 'America/Chicago',
  zip_allowlist text[] not null default array[
    -- Frisco
    '75033', '75034', '75035', '75036',
    -- Plano
    '75023', '75024', '75025', '75026', '75074', '75075', '75093', '75094',
    -- McKinney
    '75069', '75070', '75071', '75072',
    -- Allen
    '75002', '75013',
    -- Prosper
    '75078',
    -- Little Elm
    '75068',
    -- The Colony
    '75056',
    -- Richardson
    '75080', '75081', '75082',
    -- Carrollton
    '75006', '75007', '75010'
  ],
  email_display_name text not null default 'StemCycle Pickup',
  reply_to text,
  retention_days int not null default 90 check (retention_days >= 7),
  -- Booking + availability
  booking_weekends int not null default 4 check (booking_weekends between 1 and 12),
  first_hour int not null default 8 check (first_hour between 0 and 23),
  last_hour int not null default 18 check (last_hour between 1 and 24),
  stops_per_driver_hour int not null default 4 check (stops_per_driver_hour between 1 and 20),
  lock_time time not null default '18:00',      -- on the Friday before each weekend
  -- Routing
  books_per_box int not null default 20 check (books_per_box between 1 and 200),
  service_min_base int not null default 5 check (service_min_base between 0 and 60),
  service_min_per_50_books int not null default 1 check (service_min_per_50_books between 0 and 30),
  max_route_min int not null default 240 check (max_route_min between 30 and 720),
  return_buffer_min int not null default 45 check (return_buffer_min between 0 and 180),
  -- Depot: where every route starts and ends
  depot_name text not null default 'Depot',
  depot_address text not null default '',
  depot_lat double precision,
  depot_lng double precision,
  updated_at timestamptz not null default now(),
  check (last_hour > first_hour)
);
insert into settings default values;

-- One row per driver per available hour (Saturdays and Sundays only).
create table driver_hours (
  driver_id uuid not null references profiles (id) on delete cascade,
  avail_date date not null check (extract(isodow from avail_date) in (6, 7)),
  hour int not null check (hour between 0 and 23),
  primary key (driver_id, avail_date, hour)
);
create index driver_hours_slot_idx on driver_hours (avail_date, hour);

create table pickups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text not null,
  address_line text not null,
  city text not null,
  zip text not null,
  textbook_type textbook_type not null,
  book_count int not null check (book_count between 1 and 2000),
  est_boxes int not null check (est_boxes >= 1),
  notes text,
  slot_date date not null check (extract(isodow from slot_date) in (6, 7)),
  slot_hour int not null check (slot_hour between 0 and 23),
  status pickup_status not null default 'pending',
  geocode_status geocode_status not null default 'pending',
  lat double precision,
  lng double precision,
  pinned_driver_id uuid references profiles (id) on delete set null, -- admin override
  route_issue text,                      -- why routing couldn't place it (null = fine)
  cancel_token_hash text not null unique,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  picked_up_at timestamptz,
  anonymized_at timestamptz
);
create index pickups_slot_idx on pickups (slot_date, slot_hour);
create index pickups_status_idx on pickups (status);

-- Routing bookkeeping per weekend (keyed by its Saturday).
create table weekends (
  weekend_date date primary key check (extract(isodow from weekend_date) = 6),
  dirty_at timestamptz,          -- something changed; re-plan once things go quiet
  run_started_at timestamptz,
  last_run_at timestamptz,
  last_run_status text,
  locked_at timestamptz          -- routes are final (set by the run at lock time)
);

create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

-- IDs only; never PII. actor_id null = the admin or the system.
create table audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row level security. The server uses the service role (bypasses RLS) for the
-- public form and the admin; drivers go through RLS with their own JWT.
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table settings enable row level security;
alter table driver_hours enable row level security;
alter table pickups enable row level security;
alter table weekends enable row level security;
alter table rate_limits enable row level security;
alter table audit_log enable row level security;

create policy profiles_self_read on profiles for select using (id = auth.uid());
create policy driver_hours_self_read on driver_hours for select using (driver_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Business-rule errors use SQLSTATE P0001 with a short, PII-free code as message.
create function app_error(p_code text) returns void
language plpgsql as $$
begin
  raise exception '%', p_code using errcode = 'P0001';
end;
$$;

create function write_audit(p_action text, p_entity text, p_entity_id uuid) returns void
language sql security definer set search_path = public as $$
  insert into audit_log (actor_id, action, entity, entity_id)
  values (auth.uid(), p_action, p_entity, p_entity_id);
$$;

create function org_tz() returns text
language sql stable security definer set search_path = public as $$
  select timezone from settings where id;
$$;

-- Saturday of the weekend containing a Saturday or Sunday.
create function weekend_of(p_date date) returns date
language sql immutable as $$
  select p_date - (extract(isodow from p_date)::int - 6);
$$;

-- When a weekend's routes become final: the Friday before, at settings.lock_time.
create function weekend_lock_at(p_weekend date) returns timestamptz
language sql stable security definer set search_path = public as $$
  select ((p_weekend - 1) + lock_time) at time zone timezone from settings where id;
$$;

create function slot_starts_at(p_date date, p_hour int) returns timestamptz
language sql stable as $$
  select (p_date + make_time(p_hour, 0, 0)) at time zone org_tz();
$$;

-- Saturdays and Sundays still open for booking/availability, soonest first.
create function open_weekend_dates(p_now timestamptz default now()) returns setof date
language sql stable security definer set search_path = public as $$
  select d::date
  from settings s,
       generate_series((p_now at time zone s.timezone)::date,
                       (p_now at time zone s.timezone)::date + 7 * s.booking_weekends,
                       interval '1 day') as d
  where s.id
    and extract(isodow from d) in (6, 7)
    and weekend_lock_at(weekend_of(d::date)) > p_now
    and not exists (select 1 from weekends w
                    where w.weekend_date = weekend_of(d::date) and w.locked_at is not null)
  order by d;
$$;

-- Something on this weekend changed: routing re-runs once things go quiet.
create function mark_weekend_dirty(p_date date) returns void
language sql security definer set search_path = public as $$
  insert into weekends (weekend_date, dirty_at) values (weekend_of(p_date), now())
  on conflict (weekend_date) do update set dirty_at = now()
  where weekends.locked_at is null;
$$;

-- Booking capacity: active drivers available that hour x stops per driver-hour.
create function slot_capacity(p_date date, p_hour int) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int * (select stops_per_driver_hour from settings where id)
  from driver_hours h join profiles p on p.id = h.driver_id
  where h.avail_date = p_date and h.hour = p_hour and p.status = 'active';
$$;

create function slot_booked(p_date date, p_hour int) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from pickups
  where slot_date = p_date and slot_hour = p_hour and status <> 'cancelled';
$$;

-- ---------------------------------------------------------------------------
-- Public form (service role only). All return jsonb.
-- ---------------------------------------------------------------------------

create function get_public_settings() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'org_name', org_name,
    'timezone', timezone,
    'zip_allowlist', to_jsonb(zip_allowlist),
    'email_display_name', email_display_name,
    'reply_to', reply_to,
    'books_per_box', books_per_box
  ) from settings where id;
$$;

-- Bookable 1-hour slots: weekend hours with an available driver and room left.
create function available_slots(p_now timestamptz default now()) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'slot_date', t.avail_date, 'hour', t.hour, 'remaining', t.cap - t.booked)
         order by t.avail_date, t.hour), '[]'::jsonb)
  from (
    select h.avail_date, h.hour,
           count(*)::int * (select stops_per_driver_hour from settings where id) as cap,
           slot_booked(h.avail_date, h.hour) as booked
    from driver_hours h join profiles p on p.id = h.driver_id
    where p.status = 'active'
      and h.avail_date in (select open_weekend_dates(p_now))
      and slot_starts_at(h.avail_date, h.hour) > p_now
    group by h.avail_date, h.hour
  ) t
  where t.cap > t.booked;
$$;

create function create_pickup(p jsonb, p_cancel_token_hash text, p_now timestamptz default now())
returns jsonb
language plpgsql as $$
declare
  v_date date := (p ->> 'slot_date')::date;
  v_hour int := (p ->> 'slot_hour')::int;
  v_books int := (p ->> 'book_count')::int;
  v_id uuid;
begin
  if not exists (select 1 from settings where id and (p ->> 'zip') = any (zip_allowlist)) then
    return jsonb_build_object('result', 'out_of_area');
  end if;

  -- Serialize bookings for this slot so concurrent submissions can't overbook it.
  perform pg_advisory_xact_lock(hashtext('slot:' || v_date || ':' || v_hour));

  if extract(isodow from v_date) not in (6, 7)
     or v_date not in (select open_weekend_dates(p_now))
     or slot_starts_at(v_date, v_hour) <= p_now
     or slot_capacity(v_date, v_hour) = 0 then
    return jsonb_build_object('result', 'slot_unavailable');
  end if;
  if slot_booked(v_date, v_hour) >= slot_capacity(v_date, v_hour) then
    return jsonb_build_object('result', 'slot_full');
  end if;

  insert into pickups (name, email, phone, address_line, city, zip, textbook_type, book_count,
                       est_boxes, notes, slot_date, slot_hour, cancel_token_hash)
  values (p ->> 'name', p ->> 'email', p ->> 'phone', p ->> 'address_line', p ->> 'city',
          p ->> 'zip', (p ->> 'textbook_type')::textbook_type, v_books,
          greatest(1, ceil(v_books::numeric / (select books_per_box from settings where id)))::int,
          p ->> 'notes', v_date, v_hour, p_cancel_token_hash)
  returning id into v_id;

  perform mark_weekend_dirty(v_date);
  insert into audit_log (action, entity, entity_id) values ('create', 'pickup', v_id);

  return jsonb_build_object('result', 'ok', 'pickup_id', v_id,
                            'slot', jsonb_build_object('slot_date', v_date, 'hour', v_hour));
end;
$$;

create function lookup_cancel(p_token_hash text) returns jsonb
language sql stable as $$
  select jsonb_build_object('status', status, 'slot_date', slot_date, 'hour', slot_hour)
  from pickups where cancel_token_hash = p_token_hash and anonymized_at is null;
$$;

create function cancel_pickup(p_token_hash text) returns jsonb
language plpgsql as $$
declare
  v_id uuid;
  v_date date;
  v_status pickup_status;
begin
  update pickups set status = 'cancelled', cancelled_at = now()
  where cancel_token_hash = p_token_hash
    and status in ('pending', 'scheduled')
    and anonymized_at is null
  returning id, slot_date into v_id, v_date;

  if v_id is not null then
    perform mark_weekend_dirty(v_date);
    insert into audit_log (action, entity, entity_id) values ('cancel_by_resident', 'pickup', v_id);
    return jsonb_build_object('result', 'cancelled');
  end if;

  select status into v_status from pickups
  where cancel_token_hash = p_token_hash and anonymized_at is null;
  if not found then
    return jsonb_build_object('result', 'not_found');
  elsif v_status = 'cancelled' then
    return jsonb_build_object('result', 'already_cancelled');
  else
    return jsonb_build_object('result', 'already_picked_up');
  end if;
end;
$$;

-- Fixed-window counter. Returns true while the caller is within the limit.
create function rate_limit_hit(p_key text, p_window_seconds int, p_max int) returns boolean
language plpgsql as $$
declare
  v_window timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count int;
begin
  insert into rate_limits (key, window_start, count) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = rate_limits.count + 1
  returning count into v_count;

  if random() < 0.02 then
    delete from rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_max;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Every migration ends with `select apply_grants();` so new functions
-- are locked down by naming convention:
--   driver_*, my_profile  -> signed-in drivers (each checks auth.uid() itself)
--   rls_*                 -> helpers used inside RLS policies (all roles)
--   everything else       -> service role only (public form, admin, jobs)
-- ---------------------------------------------------------------------------

create function apply_grants() returns void
language plpgsql as $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname as name
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
    if f.name like 'driver\_%' or f.name = 'my_profile' then
      execute format('grant execute on function %s to authenticated', f.sig);
    elsif f.name like 'rls\_%' then
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    end if;
  end loop;
end;
$$;

select apply_grants();
