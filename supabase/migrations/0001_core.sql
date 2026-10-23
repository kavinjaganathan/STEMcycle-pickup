-- StemCycle Pickup: core schema (Phase 1)
-- Runs on Supabase Postgres. Business rules live in SQL functions so the web app
-- (and local PGlite dev/test runs) share one implementation.

create type user_role as enum ('admin', 'driver');
create type pickup_status as enum ('pending', 'scheduled', 'picked_up', 'cancelled');
create type geocode_status as enum ('pending', 'ok', 'needs_review', 'failed');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null default 'driver',
  full_name text not null default '',
  phone text,
  active boolean not null default true,
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
  booking_cutoff_hours int not null default 12 check (booking_cutoff_hours >= 0),
  email_display_name text not null default 'StemCycle Pickup',
  reply_to text,
  retention_days int not null default 90 check (retention_days >= 7),
  updated_at timestamptz not null default now()
);
insert into settings default values;

create table slots (
  id uuid primary key default gen_random_uuid(),
  slot_date date not null,
  start_time time not null,
  end_time time not null,
  capacity int check (capacity is null or capacity > 0), -- null = unlimited
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index slots_date_idx on slots (slot_date);

create table pickups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text not null,
  address_line text not null,
  city text not null,
  zip text not null,
  book_count int not null check (book_count between 1 and 2000),
  notes text,
  slot_id uuid not null references slots (id),
  status pickup_status not null default 'pending',
  geocode_status geocode_status not null default 'pending',
  lat double precision,
  lng double precision,
  cancel_token_hash text not null unique,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  picked_up_at timestamptz,
  anonymized_at timestamptz
);
create index pickups_slot_idx on pickups (slot_id);
create index pickups_status_idx on pickups (status);

create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

-- IDs only; never PII.
create table audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row level security. The server uses the service role (bypasses RLS) for
-- public-form work via the functions below; signed-in admins go through RLS.
-- ---------------------------------------------------------------------------

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin' and active
  );
$$;

alter table profiles enable row level security;
alter table settings enable row level security;
alter table slots enable row level security;
alter table pickups enable row level security;
alter table rate_limits enable row level security;
alter table audit_log enable row level security;

create policy profiles_self_read on profiles for select using (id = auth.uid());
create policy profiles_admin_all on profiles for all using (is_admin()) with check (is_admin());
create policy settings_admin_all on settings for all using (is_admin()) with check (is_admin());
create policy slots_admin_all on slots for all using (is_admin()) with check (is_admin());
create policy pickups_admin_all on pickups for all using (is_admin()) with check (is_admin());
create policy audit_admin_read on audit_log for select using (is_admin());
-- rate_limits: no policies -> only the service role can touch it.

-- ---------------------------------------------------------------------------
-- Functions used by the public form (service role only). All return jsonb.
-- ---------------------------------------------------------------------------

create function get_public_settings() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'org_name', org_name,
    'timezone', timezone,
    'zip_allowlist', to_jsonb(zip_allowlist),
    'booking_cutoff_hours', booking_cutoff_hours,
    'email_display_name', email_display_name,
    'reply_to', reply_to
  ) from settings where id;
$$;

-- Slot start as an absolute instant, in the org timezone.
create function slot_starts_at(s slots) returns timestamptz
language sql stable as $$
  select (s.slot_date + s.start_time) at time zone (select timezone from settings where id);
$$;

create function available_slots(p_now timestamptz default now()) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.slot_date, t.start_time), '[]'::jsonb)
  from (
    select s.id, s.slot_date, s.start_time, s.end_time,
           case when s.capacity is null then null
                else s.capacity - (select count(*) from pickups p
                                   where p.slot_id = s.id and p.status <> 'cancelled')
           end as remaining
    from slots s
    where s.active
      and slot_starts_at(s) > p_now + make_interval(
            hours => (select booking_cutoff_hours from settings where id))
  ) t
  where t.remaining is null or t.remaining > 0;
$$;

create function create_pickup(
  p_name text,
  p_email text,
  p_phone text,
  p_address_line text,
  p_city text,
  p_zip text,
  p_book_count int,
  p_notes text,
  p_slot_id uuid,
  p_cancel_token_hash text,
  p_now timestamptz default now()
) returns jsonb
language plpgsql as $$
declare
  v_slot slots;
  v_booked int;
  v_id uuid;
begin
  if not exists (select 1 from settings where id and p_zip = any (zip_allowlist)) then
    return jsonb_build_object('result', 'out_of_area');
  end if;

  -- Lock the slot so concurrent submissions can't overbook it.
  select * into v_slot from slots where id = p_slot_id for update;
  if not found or not v_slot.active
     or slot_starts_at(v_slot) <= p_now + make_interval(
          hours => (select booking_cutoff_hours from settings where id)) then
    return jsonb_build_object('result', 'slot_unavailable');
  end if;

  if v_slot.capacity is not null then
    select count(*) into v_booked from pickups
    where slot_id = p_slot_id and status <> 'cancelled';
    if v_booked >= v_slot.capacity then
      return jsonb_build_object('result', 'slot_full');
    end if;
  end if;

  insert into pickups (name, email, phone, address_line, city, zip, book_count, notes,
                       slot_id, cancel_token_hash)
  values (p_name, p_email, p_phone, p_address_line, p_city, p_zip, p_book_count, p_notes,
          p_slot_id, p_cancel_token_hash)
  returning id into v_id;

  insert into audit_log (action, entity, entity_id) values ('create', 'pickup', v_id);

  return jsonb_build_object(
    'result', 'ok',
    'pickup_id', v_id,
    'slot', jsonb_build_object('slot_date', v_slot.slot_date,
                               'start_time', v_slot.start_time,
                               'end_time', v_slot.end_time)
  );
end;
$$;

create function lookup_cancel(p_token_hash text) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'status', p.status,
    'slot_date', s.slot_date,
    'start_time', s.start_time,
    'end_time', s.end_time
  )
  from pickups p join slots s on s.id = p.slot_id
  where p.cancel_token_hash = p_token_hash and p.anonymized_at is null;
$$;

create function cancel_pickup(p_token_hash text) returns jsonb
language plpgsql as $$
declare
  v_id uuid;
  v_status pickup_status;
begin
  update pickups set status = 'cancelled', cancelled_at = now()
  where cancel_token_hash = p_token_hash
    and status in ('pending', 'scheduled')
    and anonymized_at is null
  returning id into v_id;

  if v_id is not null then
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

revoke execute on function get_public_settings(), available_slots(timestamptz),
  create_pickup(text, text, text, text, text, text, int, text, uuid, text, timestamptz),
  lookup_cancel(text), cancel_pickup(text), rate_limit_hit(text, int, int)
  from public, anon, authenticated;
grant execute on function get_public_settings(), available_slots(timestamptz),
  create_pickup(text, text, text, text, text, text, int, text, uuid, text, timestamptz),
  lookup_cancel(text), cancel_pickup(text), rate_limit_hit(text, int, int)
  to service_role;
