-- StemCycle Pickup: automatic routing
-- The web app builds and solves a plan per weekend day and saves it here.
-- Plans are published as soon as they're saved; the weekend locks (routes
-- final) on the Friday before at settings.lock_time.

create type plan_status as enum ('published', 'superseded');

create table route_plans (
  id uuid primary key default gen_random_uuid(),
  plan_date date not null,
  solver text not null,            -- 'ortools' | 'fallback' | 'none'
  matrix_provider text not null,   -- 'ors' | 'osrm' | 'fake' | 'none'
  status plan_status not null default 'published',
  depot jsonb,                     -- {name, address, lat, lng} at planning time
  unassigned jsonb not null default '[]',  -- [{pickup_id, reason}]
  created_at timestamptz not null default now()
);
create index route_plans_date_idx on route_plans (plan_date, status);
create unique index route_plans_one_published on route_plans (plan_date) where status = 'published';

create table routes (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references route_plans (id) on delete cascade,
  driver_id uuid references profiles (id) on delete set null,
  driver_name text not null,
  color text not null,
  start_at time not null,
  end_at time not null,
  total_seconds int not null,
  total_meters int,
  total_boxes int not null,
  geometry jsonb not null default '[]'      -- [[lat, lng], ...]
);
create index routes_plan_idx on routes (plan_id);
create index routes_driver_idx on routes (driver_id);

create table route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes (id) on delete cascade,
  pickup_id uuid not null references pickups (id) on delete cascade,
  seq int not null,
  eta time not null,
  depart time not null,
  unique (route_id, seq)
);
create index route_stops_pickup_idx on route_stops (pickup_id);

-- No policies: drivers read their stops only through driver_routes().
alter table route_plans enable row level security;
alter table routes enable row level security;
alter table route_stops enable row level security;

-- ---------------------------------------------------------------------------
-- Scheduling runs (service role). A run is claimed by setting run_started_at;
-- a claim older than 10 minutes is treated as crashed and can be retaken.
-- ---------------------------------------------------------------------------

-- Weekends to re-plan now: changed and quiet for p_quiet_seconds, or due to lock.
create function claim_routing_work(p_now timestamptz, p_quiet_seconds int) returns jsonb
language plpgsql as $$
declare
  v jsonb := '[]';
  r weekends;
begin
  for r in
    select * from weekends w
    where w.locked_at is null
      and w.weekend_date + 1 >= (p_now at time zone org_tz())::date
      and (w.run_started_at is null or w.run_started_at < p_now - interval '10 minutes')
      and (weekend_lock_at(w.weekend_date) <= p_now
           or w.dirty_at <= p_now - make_interval(secs => p_quiet_seconds))
    order by w.weekend_date
    for update skip locked
  loop
    update weekends set run_started_at = p_now where weekend_date = r.weekend_date;
    v := v || jsonb_build_object('weekend', r.weekend_date, 'dirty_at', r.dirty_at,
                                 'final', weekend_lock_at(r.weekend_date) <= p_now);
  end loop;
  return v;
end;
$$;

-- Cheap check used by pg_cron so the app is only called when there's work.
create function routing_work_due(p_quiet_seconds int default 120) returns boolean
language sql stable as $$
  select exists (
    select 1 from weekends w
    where w.locked_at is null
      and w.weekend_date + 1 >= (now() at time zone org_tz())::date
      and (w.run_started_at is null or w.run_started_at < now() - interval '10 minutes')
      and (weekend_lock_at(w.weekend_date) <= now()
           or w.dirty_at <= now() - make_interval(secs => p_quiet_seconds)));
$$;

-- Claim one weekend for an admin-triggered run. Null if a run is in progress.
create function claim_weekend(p_weekend date, p_now timestamptz default now()) returns jsonb
language plpgsql as $$
declare
  r weekends;
begin
  insert into weekends (weekend_date) values (p_weekend) on conflict do nothing;
  select * into r from weekends where weekend_date = p_weekend for update;
  if r.run_started_at is not null and r.run_started_at >= p_now - interval '10 minutes' then
    return null;
  end if;
  update weekends set run_started_at = p_now where weekend_date = p_weekend;
  return jsonb_build_object('weekend', p_weekend, 'dirty_at', r.dirty_at, 'final', false);
end;
$$;

create function finish_routing_run(p_weekend date, p_dirty_at timestamptz, p_status text,
                                   p_final boolean) returns void
language sql as $$
  update weekends set
    run_started_at = null,
    last_run_at = now(),
    last_run_status = p_status,
    -- Changes made while this run was going keep the weekend dirty.
    dirty_at = case when dirty_at is not distinct from p_dirty_at then null else dirty_at end,
    locked_at = case when p_final then now() else locked_at end
  where weekend_date = p_weekend;
$$;

-- Everything the planner needs for one day (no names or contact details).
create function routing_inputs(p_date date) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'settings', jsonb_build_object(
      'depot_name', s.depot_name, 'depot_address', s.depot_address,
      'depot_lat', s.depot_lat, 'depot_lng', s.depot_lng,
      'service_min_base', s.service_min_base,
      'service_min_per_50_books', s.service_min_per_50_books,
      'max_route_min', s.max_route_min, 'return_buffer_min', s.return_buffer_min),
    'drivers', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name,
                                          'capacity_boxes', p.capacity_boxes, 'hours', h.hours)
                       order by p.full_name, p.id)
      from profiles p
      join (select driver_id, jsonb_agg(hour order by hour) as hours from driver_hours
            where avail_date = p_date group by driver_id) h on h.driver_id = p.id
      where p.status = 'active'), '[]'::jsonb),
    'pickups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pk.id, 'slot_hour', pk.slot_hour, 'est_boxes', pk.est_boxes,
        'book_count', pk.book_count, 'lat', pk.lat, 'lng', pk.lng,
        'geocode_status', pk.geocode_status, 'pinned_driver_id', pk.pinned_driver_id)
        order by pk.slot_hour, pk.created_at)
      from pickups pk
      where pk.slot_date = p_date and pk.status in ('pending', 'scheduled')
        and pk.anonymized_at is null), '[]'::jsonb)
  )
  from settings s where s.id;
$$;

-- Ordered pickup ids per driver in a plan; used to tell who's route changed.
create function plan_signatures(p_plan uuid) returns table (driver_id uuid, sig text)
language sql stable as $$
  select r.driver_id, string_agg(st.pickup_id::text, ',' order by r.start_at, st.seq)
  from routes r join route_stops st on st.route_id = r.id
  where r.plan_id = p_plan and r.driver_id is not null
  group by r.driver_id;
$$;

-- Saves and publishes a plan for one day. Returns drivers whose stops changed.
create function save_route_plan(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_date date := (p ->> 'plan_date')::date;
  v_prev uuid;
  v_plan uuid;
  v_route uuid;
  r jsonb;
  st jsonb;
  v_changed jsonb;
begin
  select id into v_prev from route_plans
  where plan_date = v_date and status = 'published' for update;
  update route_plans set status = 'superseded' where id = v_prev;

  insert into route_plans (plan_date, solver, matrix_provider, depot, unassigned)
  values (v_date, p ->> 'solver', p ->> 'matrix_provider', p -> 'depot',
          coalesce(p -> 'unassigned', '[]'))
  returning id into v_plan;

  for r in select * from jsonb_array_elements(p -> 'routes') loop
    insert into routes (plan_id, driver_id, driver_name, color, start_at, end_at,
                        total_seconds, total_meters, total_boxes, geometry)
    values (v_plan, (r ->> 'driver_id')::uuid, r ->> 'driver_name', r ->> 'color',
            (r ->> 'start_at')::time, (r ->> 'end_at')::time, (r ->> 'total_seconds')::int,
            (r ->> 'total_meters')::int, (r ->> 'total_boxes')::int,
            coalesce(r -> 'geometry', '[]'))
    returning id into v_route;

    for st in select * from jsonb_array_elements(r -> 'stops') loop
      insert into route_stops (route_id, pickup_id, seq, eta, depart)
      values (v_route, (st ->> 'pickup_id')::uuid, (st ->> 'seq')::int, (st ->> 'eta')::time,
              (st ->> 'depart')::time);
    end loop;
  end loop;

  -- Routed pickups are scheduled; the rest of the day goes back to pending.
  update pickups pk set
    status = case when pk.status = 'pending' then 'scheduled' else pk.status end,
    route_issue = null
  where pk.id in (select st.pickup_id from route_stops st join routes rt on rt.id = st.route_id
                  where rt.plan_id = v_plan);
  update pickups pk set
    status = case when pk.status = 'scheduled' then 'pending' else pk.status end,
    route_issue = coalesce(
      (select u ->> 'reason' from jsonb_array_elements(p -> 'unassigned') u
       where (u ->> 'pickup_id')::uuid = pk.id limit 1),
      'Not routed yet.')
  where pk.slot_date = v_date and pk.status in ('pending', 'scheduled')
    and pk.id not in (select st.pickup_id from route_stops st join routes rt on rt.id = st.route_id
                      where rt.plan_id = v_plan);

  select coalesce(jsonb_agg(coalesce(a.driver_id, b.driver_id)), '[]'::jsonb) into v_changed
  from (select * from plan_signatures(v_prev)) a
  full join (select * from plan_signatures(v_plan)) b on a.driver_id = b.driver_id
  where a.sig is distinct from b.sig;

  insert into audit_log (action, entity, entity_id) values ('plan_routes', 'route_plan', v_plan);
  return jsonb_build_object('id', v_plan, 'changed_driver_ids', v_changed);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading plans
-- ---------------------------------------------------------------------------

-- A published plan with routes and stops. Contact details only for the admin view.
create function plan_json(p_plan uuid, p_driver uuid default null) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', rp.id,
    'plan_date', rp.plan_date,
    'solver', rp.solver,
    'matrix_provider', rp.matrix_provider,
    'created_at', rp.created_at,
    'depot', rp.depot,
    'routes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'driver_id', r.driver_id, 'driver_name', r.driver_name, 'color', r.color,
        'start_at', r.start_at, 'end_at', r.end_at, 'total_seconds', r.total_seconds,
        'total_meters', r.total_meters, 'total_boxes', r.total_boxes, 'geometry', r.geometry,
        'stops', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', st.id, 'seq', st.seq, 'eta', st.eta, 'depart', st.depart,
            'pickup_id', pk.id, 'name', pk.name, 'phone', pk.phone,
            'address_line', pk.address_line, 'city', pk.city, 'zip', pk.zip,
            'textbook_type', pk.textbook_type, 'book_count', pk.book_count,
            'est_boxes', pk.est_boxes, 'notes', pk.notes, 'status', pk.status,
            'lat', pk.lat, 'lng', pk.lng, 'slot_hour', pk.slot_hour,
            'pinned', pk.pinned_driver_id is not null
          ) order by st.seq)
          from route_stops st join pickups pk on pk.id = st.pickup_id
          where st.route_id = r.id), '[]'::jsonb)
      ) order by r.driver_name, r.start_at)
      from routes r
      where r.plan_id = rp.id and (p_driver is null or r.driver_id = p_driver)), '[]'::jsonb)
  )
  from route_plans rp where rp.id = p_plan;
$$;

create function admin_get_weekend(p_weekend date) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'weekend_date', p_weekend,
    'lock_at', weekend_lock_at(p_weekend),
    'locked_at', w.locked_at,
    'dirty_at', w.dirty_at,
    'running', w.run_started_at is not null and w.run_started_at > now() - interval '10 minutes',
    'last_run_at', w.last_run_at,
    'last_run_status', w.last_run_status,
    'days', (
      select jsonb_agg(jsonb_build_object(
        'date', d,
        'plan', (select plan_json(rp.id) from route_plans rp
                 where rp.plan_date = d and rp.status = 'published'),
        'unassigned', coalesce((
          select jsonb_agg(jsonb_build_object(
            'pickup_id', pk.id, 'name', pk.name, 'address_line', pk.address_line,
            'city', pk.city, 'slot_hour', pk.slot_hour, 'book_count', pk.book_count,
            'est_boxes', pk.est_boxes, 'geocode_status', pk.geocode_status,
            'reason', pk.route_issue, 'pinned_driver_id', pk.pinned_driver_id)
            order by pk.slot_hour)
          from pickups pk
          where pk.slot_date = d and pk.status = 'pending' and pk.anonymized_at is null),
          '[]'::jsonb),
        'drivers', coalesce((
          select jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name,
                                              'capacity_boxes', p.capacity_boxes,
                                              'hours', h.hours) order by p.full_name)
          from profiles p
          join (select driver_id, jsonb_agg(hour order by hour) as hours from driver_hours
                where avail_date = d group by driver_id) h on h.driver_id = p.id
          where p.status = 'active'), '[]'::jsonb)
      ) order by d)
      from (values (p_weekend), (p_weekend + 1)) as days (d))
  )
  from (select 1) one left join weekends w on w.weekend_date = p_weekend;
$$;

-- Drivers with stops on a weekend, for "your route is ready/changed" emails.
create function weekend_driver_contacts(p_weekend date, p_driver_ids uuid[] default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'email', u.email,
                                               'full_name', p.full_name)), '[]'::jsonb)
  from profiles p join auth.users u on u.id = p.id
  where p.status = 'active'
    and (p_driver_ids is null or p.id = any (p_driver_ids))
    and (p_driver_ids is not null or exists (
      select 1 from routes r join route_plans rp on rp.id = r.plan_id
      where r.driver_id = p.id and rp.status = 'published'
        and rp.plan_date in (p_weekend, p_weekend + 1)));
$$;

-- ---------------------------------------------------------------------------
-- Drivers (signed in; each function filters to auth.uid())
-- ---------------------------------------------------------------------------

-- My routes for a weekend (Saturday + Sunday). No resident emails.
create function driver_routes(p_weekend date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_driver uuid := require_active_driver();
begin
  return jsonb_build_object(
    'weekend_date', p_weekend,
    'lock_at', weekend_lock_at(p_weekend),
    'locked', exists (select 1 from weekends where weekend_date = p_weekend
                      and locked_at is not null),
    'days', (
      select jsonb_agg(jsonb_build_object(
        'date', d,
        'depot', (select rp.depot from route_plans rp
                  where rp.plan_date = d and rp.status = 'published'),
        'routes', coalesce((
          select plan_json(rp.id, v_driver) -> 'routes' from route_plans rp
          where rp.plan_date = d and rp.status = 'published'), '[]'::jsonb),
        'hours', coalesce((select jsonb_agg(hour order by hour) from driver_hours
                           where driver_id = v_driver and avail_date = d), '[]'::jsonb)
      ) order by d)
      from (values (p_weekend), (p_weekend + 1)) as days (d)));
end;
$$;

-- Mark one of my stops picked up (or undo).
create function driver_set_stop_status(p_stop_id uuid, p_picked_up boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_driver uuid := require_active_driver();
  v_pickup uuid;
  v_status pickup_status;
begin
  select st.pickup_id into v_pickup
  from route_stops st join routes r on r.id = st.route_id
  join route_plans rp on rp.id = r.plan_id
  where st.id = p_stop_id and r.driver_id = v_driver and rp.status = 'published';
  if v_pickup is null then perform app_error('stop_not_yours'); end if;

  select status into v_status from pickups where id = v_pickup for update;
  if v_status = 'cancelled' then perform app_error('pickup_cancelled'); end if;

  if p_picked_up then
    update pickups set status = 'picked_up', picked_up_at = coalesce(picked_up_at, now())
    where id = v_pickup;
  else
    update pickups set status = 'scheduled', picked_up_at = null where id = v_pickup;
  end if;
  perform write_audit(case when p_picked_up then 'driver_picked_up' else 'driver_undo' end,
                      'pickup', v_pickup);
  return jsonb_build_object('ok', true,
                            'status', case when p_picked_up then 'picked_up' else 'scheduled' end);
end;
$$;

select apply_grants();
