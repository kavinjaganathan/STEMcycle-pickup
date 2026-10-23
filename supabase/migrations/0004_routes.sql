-- StemCycle Pickup: route planning (Phase 4)

create type plan_status as enum ('draft', 'published', 'superseded');

create table route_plans (
  id uuid primary key default gen_random_uuid(),
  plan_date date not null,
  start_depot_id uuid references depots (id) on delete set null,
  end_depot_id uuid references depots (id) on delete set null,
  start_time time not null,
  solver text not null,            -- 'ortools' | 'fallback'
  matrix_provider text not null,   -- 'ors' | 'osrm' | 'fake'
  status plan_status not null default 'draft',
  unassigned jsonb not null default '[]',  -- [{pickup_id, reason}]
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create index route_plans_date_idx on route_plans (plan_date, status);

create table routes (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references route_plans (id) on delete cascade,
  vehicle_id uuid references vehicles (id) on delete set null,
  driver_id uuid references profiles (id) on delete set null,
  vehicle_name text not null,
  color text not null,
  start_at time not null,
  end_at time not null,
  total_seconds int not null,
  total_meters int,
  total_books int not null,
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

alter table route_plans enable row level security;
alter table routes enable row level security;
alter table route_stops enable row level security;
create policy route_plans_admin_all on route_plans for all using (is_admin()) with check (is_admin());
create policy routes_admin_all on routes for all using (is_admin()) with check (is_admin());
create policy route_stops_admin_all on route_stops for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------

create function admin_save_route_plan(p jsonb) returns jsonb
language plpgsql as $$
declare
  v_plan uuid;
  v_route uuid;
  r jsonb;
  st jsonb;
begin
  perform require_admin();
  delete from route_plans where plan_date = (p ->> 'plan_date')::date and status = 'draft';

  insert into route_plans (plan_date, start_depot_id, end_depot_id, start_time, solver,
                           matrix_provider, unassigned)
  values ((p ->> 'plan_date')::date, (p ->> 'start_depot_id')::uuid, (p ->> 'end_depot_id')::uuid,
          (p ->> 'start_time')::time, p ->> 'solver', p ->> 'matrix_provider',
          coalesce(p -> 'unassigned', '[]'))
  returning id into v_plan;

  for r in select * from jsonb_array_elements(p -> 'routes') loop
    insert into routes (plan_id, vehicle_id, driver_id, vehicle_name, color, start_at, end_at,
                        total_seconds, total_meters, total_books, geometry)
    values (v_plan, (r ->> 'vehicle_id')::uuid, nullif(r ->> 'driver_id', '')::uuid,
            r ->> 'vehicle_name', r ->> 'color', (r ->> 'start_at')::time, (r ->> 'end_at')::time,
            (r ->> 'total_seconds')::int, (r ->> 'total_meters')::int, (r ->> 'total_books')::int,
            coalesce(r -> 'geometry', '[]'))
    returning id into v_route;

    for st in select * from jsonb_array_elements(r -> 'stops') loop
      insert into route_stops (route_id, pickup_id, seq, eta, depart)
      values (v_route, (st ->> 'pickup_id')::uuid, (st ->> 'seq')::int, (st ->> 'eta')::time,
              (st ->> 'depart')::time);
    end loop;
  end loop;

  perform write_audit('plan_routes', 'route_plan', v_plan);
  return jsonb_build_object('id', v_plan);
end;
$$;

-- Latest plan for a date: the newest draft if there is one, else the published plan.
create function admin_get_route_plan(p_date date) returns jsonb
language plpgsql stable as $$
declare
  v_plan route_plans;
begin
  perform require_admin();
  select * into v_plan from route_plans
  where plan_date = p_date and status in ('draft', 'published')
  order by (status = 'draft') desc, created_at desc limit 1;
  if not found then return null; end if;

  return jsonb_build_object(
    'id', v_plan.id,
    'plan_date', v_plan.plan_date,
    'status', v_plan.status,
    'solver', v_plan.solver,
    'matrix_provider', v_plan.matrix_provider,
    'start_time', v_plan.start_time,
    'created_at', v_plan.created_at,
    'published_at', v_plan.published_at,
    'has_published', exists (select 1 from route_plans where plan_date = p_date and status = 'published'),
    'start_depot', (select jsonb_build_object('id', d.id, 'name', d.name, 'lat', d.lat, 'lng', d.lng)
                    from depots d where d.id = v_plan.start_depot_id),
    'end_depot', (select jsonb_build_object('id', d.id, 'name', d.name, 'lat', d.lat, 'lng', d.lng)
                  from depots d where d.id = v_plan.end_depot_id),
    'routes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'vehicle_id', r.vehicle_id, 'vehicle_name', r.vehicle_name, 'color', r.color,
        'driver_id', r.driver_id, 'driver_name', pr.full_name,
        'start_at', r.start_at, 'end_at', r.end_at, 'total_seconds', r.total_seconds,
        'total_meters', r.total_meters, 'total_books', r.total_books, 'geometry', r.geometry,
        'stops', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', st.id, 'seq', st.seq, 'eta', st.eta, 'depart', st.depart,
            'pickup_id', pk.id, 'name', pk.name, 'address_line', pk.address_line, 'city', pk.city,
            'zip', pk.zip, 'book_count', pk.book_count, 'status', pk.status, 'lat', pk.lat,
            'lng', pk.lng, 'start_time', s.start_time, 'end_time', s.end_time
          ) order by st.seq)
          from route_stops st join pickups pk on pk.id = st.pickup_id join slots s on s.id = pk.slot_id
          where st.route_id = r.id), '[]'::jsonb)
      ) order by r.vehicle_name)
      from routes r left join profiles pr on pr.id = r.driver_id
      where r.plan_id = v_plan.id), '[]'::jsonb),
    'unassigned', coalesce((
      select jsonb_agg(jsonb_build_object('pickup_id', pk.id, 'name', pk.name,
                                          'address_line', pk.address_line, 'city', pk.city,
                                          'book_count', pk.book_count, 'reason', u ->> 'reason'))
      from jsonb_array_elements(v_plan.unassigned) u
      join pickups pk on pk.id = (u ->> 'pickup_id')::uuid), '[]'::jsonb)
  );
end;
$$;

create function admin_publish_route_plan(p_id uuid) returns jsonb
language plpgsql as $$
declare
  v_plan route_plans;
begin
  perform require_admin();
  select * into v_plan from route_plans where id = p_id for update;
  if not found then perform app_error('not_found'); end if;
  if v_plan.status <> 'draft' then perform app_error('plan_not_draft'); end if;

  update route_plans set status = 'superseded'
  where plan_date = v_plan.plan_date and status = 'published';
  update route_plans set status = 'published', published_at = now() where id = p_id;

  -- Everything on the new routes is scheduled ...
  update pickups set status = 'scheduled'
  where status = 'pending'
    and id in (select st.pickup_id from route_stops st join routes r on r.id = st.route_id
               where r.plan_id = p_id);
  -- ... and anything scheduled for that day but no longer routed goes back to pending.
  update pickups p set status = 'pending'
  from slots s
  where s.id = p.slot_id and s.slot_date = v_plan.plan_date and p.status = 'scheduled'
    and p.id not in (select st.pickup_id from route_stops st join routes r on r.id = st.route_id
                     where r.plan_id = p_id);

  perform write_audit('publish_routes', 'route_plan', p_id);
  return jsonb_build_object('ok', true);
end;
$$;

create function admin_discard_route_plan(p_id uuid) returns jsonb
language plpgsql as $$
begin
  perform require_admin();
  delete from route_plans where id = p_id and status = 'draft';
  if not found then perform app_error('plan_not_draft'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function admin_save_route_plan(jsonb), admin_get_route_plan(date),
  admin_publish_route_plan(uuid), admin_discard_route_plan(uuid) from public, anon;
grant execute on function admin_save_route_plan(jsonb), admin_get_route_plan(date),
  admin_publish_route_plan(uuid), admin_discard_route_plan(uuid) to authenticated, service_role;
