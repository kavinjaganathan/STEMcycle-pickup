-- StemCycle Pickup: admin dashboard (Phase 2)
-- Admin functions run as the signed-in user (security invoker), so RLS applies,
-- and each one also checks the caller is an active admin.

-- ---------------------------------------------------------------------------
-- New settings + tables
-- ---------------------------------------------------------------------------

alter table settings
  add column service_min_base int not null default 5 check (service_min_base >= 0),
  add column service_min_per_50_books int not null default 1 check (service_min_per_50_books >= 0),
  add column default_start_time time not null default '08:30';

create table depots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  lat double precision,
  lng double precision,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index depots_one_default on depots (is_default) where is_default;

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'SUV',
  capacity_books int not null default 400 check (capacity_books > 0),
  max_route_min int not null default 240 check (max_route_min between 30 and 720),
  default_driver_id uuid references profiles (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table depots enable row level security;
alter table vehicles enable row level security;
create policy depots_admin_all on depots for all using (is_admin()) with check (is_admin());
create policy vehicles_admin_all on vehicles for all using (is_admin()) with check (is_admin());

-- New auth users get a (driver) profile automatically.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, role, full_name) values (new.id, 'driver', '')
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function require_admin() returns void
language plpgsql stable as $$
begin
  if not is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

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

-- ---------------------------------------------------------------------------
-- Current user
-- ---------------------------------------------------------------------------

create function my_profile() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'role', p.role, 'full_name', p.full_name,
                            'email', u.email, 'active', p.active)
  from profiles p join auth.users u on u.id = p.id
  where p.id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Pickups
-- ---------------------------------------------------------------------------

create function admin_list_pickups(p_from date, p_to date, p_statuses pickup_status[] default null)
returns jsonb
language plpgsql stable as $$
begin
  perform require_admin();
  return (
    select coalesce(jsonb_agg(t order by t.slot_date, t.start_time, t.created_at), '[]'::jsonb)
    from (
      select p.id, p.name, p.email, p.phone, p.address_line, p.city, p.zip, p.book_count,
             p.notes, p.status, p.geocode_status, p.lat, p.lng, p.created_at,
             p.picked_up_at, p.cancelled_at, p.slot_id, s.slot_date, s.start_time, s.end_time
      from pickups p join slots s on s.id = p.slot_id
      where s.slot_date between p_from and p_to
        and (p_statuses is null or p.status = any (p_statuses))
        and p.anonymized_at is null
    ) t
  );
end;
$$;

create function admin_set_pickup_status(p_id uuid, p_status pickup_status) returns jsonb
language plpgsql as $$
begin
  perform require_admin();
  update pickups set
    status = p_status,
    picked_up_at = case when p_status = 'picked_up' then coalesce(picked_up_at, now()) else null end,
    cancelled_at = case when p_status = 'cancelled' then coalesce(cancelled_at, now()) else null end
  where id = p_id and anonymized_at is null;
  if not found then perform app_error('not_found'); end if;
  perform write_audit('set_status_' || p_status, 'pickup', p_id);
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Slots
-- ---------------------------------------------------------------------------

create function admin_list_slots(p_from date) returns jsonb
language plpgsql stable as $$
begin
  perform require_admin();
  return (
    select coalesce(jsonb_agg(t order by t.slot_date, t.start_time), '[]'::jsonb)
    from (
      select s.id, s.slot_date, s.start_time, s.end_time, s.capacity, s.active,
             (select count(*) from pickups p where p.slot_id = s.id and p.status <> 'cancelled')::int
               as booked
      from slots s where s.slot_date >= p_from
    ) t
  );
end;
$$;

create function admin_create_slots(p_dates date[], p_start time, p_end time, p_capacity int)
returns jsonb
language plpgsql as $$
declare
  v_count int;
begin
  perform require_admin();
  if p_end <= p_start then perform app_error('invalid_window'); end if;
  insert into slots (slot_date, start_time, end_time, capacity)
  select d, p_start, p_end, p_capacity from unnest(p_dates) as d
  where not exists (select 1 from slots s
                    where s.slot_date = d and s.start_time = p_start and s.end_time = p_end);
  get diagnostics v_count = row_count;
  return jsonb_build_object('created', v_count);
end;
$$;

create function admin_update_slot(p_id uuid, p_capacity int, p_active boolean) returns jsonb
language plpgsql as $$
begin
  perform require_admin();
  update slots set capacity = p_capacity, active = p_active where id = p_id;
  if not found then perform app_error('not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

create function admin_delete_slot(p_id uuid) returns jsonb
language plpgsql as $$
begin
  perform require_admin();
  if exists (select 1 from pickups where slot_id = p_id) then
    perform app_error('slot_has_pickups');
  end if;
  delete from slots where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Vehicles + depots
-- ---------------------------------------------------------------------------

create function admin_list_vehicles() returns jsonb
language plpgsql stable as $$
begin
  perform require_admin();
  return (select coalesce(jsonb_agg(v order by v.active desc, v.name), '[]'::jsonb) from vehicles v);
end;
$$;

create function admin_save_vehicle(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
begin
  perform require_admin();
  if v_id is null then
    insert into vehicles (name, type, capacity_books, max_route_min, default_driver_id, active)
    values (p ->> 'name', p ->> 'type', (p ->> 'capacity_books')::int,
            (p ->> 'max_route_min')::int, nullif(p ->> 'default_driver_id', '')::uuid,
            coalesce((p ->> 'active')::boolean, true))
    returning id into v_id;
  else
    update vehicles set name = p ->> 'name', type = p ->> 'type',
      capacity_books = (p ->> 'capacity_books')::int, max_route_min = (p ->> 'max_route_min')::int,
      default_driver_id = nullif(p ->> 'default_driver_id', '')::uuid,
      active = coalesce((p ->> 'active')::boolean, true)
    where id = v_id;
    if not found then perform app_error('not_found'); end if;
  end if;
  return jsonb_build_object('id', v_id);
end;
$$;

create function admin_delete_vehicle(p_id uuid) returns jsonb
language plpgsql as $$
begin
  perform require_admin();
  delete from vehicles where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

create function admin_list_depots() returns jsonb
language plpgsql stable as $$
begin
  perform require_admin();
  return (select coalesce(jsonb_agg(d order by d.is_default desc, d.name), '[]'::jsonb) from depots d);
end;
$$;

create function admin_save_depot(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_default boolean := coalesce((p ->> 'is_default')::boolean, false);
begin
  perform require_admin();
  if v_default then update depots set is_default = false where is_default and id is distinct from v_id; end if;
  if v_id is null then
    insert into depots (name, address, lat, lng, is_default)
    values (p ->> 'name', p ->> 'address', (p ->> 'lat')::float8, (p ->> 'lng')::float8, v_default)
    returning id into v_id;
  else
    update depots set name = p ->> 'name', address = p ->> 'address',
      lat = (p ->> 'lat')::float8, lng = (p ->> 'lng')::float8, is_default = v_default
    where id = v_id;
    if not found then perform app_error('not_found'); end if;
  end if;
  return jsonb_build_object('id', v_id);
end;
$$;

create function admin_delete_depot(p_id uuid) returns jsonb
language plpgsql as $$
begin
  perform require_admin();
  delete from depots where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Team (admins + drivers)
-- ---------------------------------------------------------------------------

-- security definer to read auth.users emails; guarded by require_admin().
create function admin_list_users() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return (
    select coalesce(jsonb_agg(t order by t.active desc, t.role, t.full_name), '[]'::jsonb)
    from (select p.id, u.email, p.role, p.full_name, p.phone, p.active
          from profiles p join auth.users u on u.id = p.id) t
  );
end;
$$;

create function admin_update_user(p_id uuid, p_role user_role, p_full_name text, p_phone text,
                                  p_active boolean) returns jsonb
language plpgsql as $$
begin
  perform require_admin();
  if p_id = auth.uid() and (p_role <> 'admin' or not p_active) then
    perform app_error('cannot_demote_self');
  end if;
  update profiles set role = p_role, full_name = p_full_name, phone = nullif(p_phone, ''),
    active = p_active
  where id = p_id;
  if not found then perform app_error('not_found'); end if;
  perform write_audit('update_user', 'profile', p_id);
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

create function admin_get_settings() returns jsonb
language plpgsql stable as $$
begin
  perform require_admin();
  return (select to_jsonb(s) - 'id' from settings s where id);
end;
$$;

create function admin_update_settings(p jsonb) returns jsonb
language plpgsql as $$
begin
  perform require_admin();
  update settings set
    org_name = p ->> 'org_name',
    timezone = p ->> 'timezone',
    zip_allowlist = array(select jsonb_array_elements_text(p -> 'zip_allowlist')),
    booking_cutoff_hours = (p ->> 'booking_cutoff_hours')::int,
    email_display_name = p ->> 'email_display_name',
    reply_to = nullif(p ->> 'reply_to', ''),
    retention_days = (p ->> 'retention_days')::int,
    service_min_base = (p ->> 'service_min_base')::int,
    service_min_per_50_books = (p ->> 'service_min_per_50_books')::int,
    default_start_time = (p ->> 'default_start_time')::time,
    updated_at = now()
  where id;
  perform write_audit('update_settings', 'settings', null);
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: signed-in users may call these; each checks the admin role itself.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
-- Public-form functions stay service-role only.
revoke execute on function get_public_settings(), available_slots(timestamptz),
  create_pickup(text, text, text, text, text, text, int, text, uuid, text, timestamptz),
  lookup_cancel(text), cancel_pickup(text), rate_limit_hit(text, int, int)
  from authenticated;
-- RLS policies call is_admin() for every role, including anon (it returns false).
grant execute on function is_admin() to anon;
