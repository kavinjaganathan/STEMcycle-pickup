-- StemCycle Pickup: driver view (Phase 5)
-- Drivers can read only their own published routes and the pickups on them.

-- Helpers are security definer so policies don't recurse through each other's RLS.
create function driver_route_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select r.id from routes r
  join route_plans p on p.id = r.plan_id
  join profiles pr on pr.id = r.driver_id
  where r.driver_id = auth.uid() and p.status = 'published' and pr.active;
$$;

create function driver_plan_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct r.plan_id from routes r where r.id in (select driver_route_ids());
$$;

create function driver_pickup_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select st.pickup_id from route_stops st where st.route_id in (select driver_route_ids());
$$;

create policy route_plans_driver_read on route_plans for select
  using (id in (select driver_plan_ids()));
create policy routes_driver_read on routes for select
  using (id in (select driver_route_ids()));
create policy route_stops_driver_read on route_stops for select
  using (route_id in (select driver_route_ids()));
create policy pickups_driver_read on pickups for select
  using (id in (select driver_pickup_ids()));
create policy slots_driver_read on slots for select
  using (id in (select p.slot_id from pickups p where p.id in (select driver_pickup_ids())));
create policy depots_driver_read on depots for select
  using (id in (select start_depot_id from route_plans where id in (select driver_plan_ids())
                union select end_depot_id from route_plans where id in (select driver_plan_ids())));

-- My published routes for a day, with everything needed at the door (no email).
create function driver_routes(p_date date) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'vehicle_name', r.vehicle_name,
    'color', r.color,
    'start_at', r.start_at,
    'end_at', r.end_at,
    'total_seconds', r.total_seconds,
    'total_books', r.total_books,
    'start_depot', (select jsonb_build_object('name', d.name, 'address', d.address, 'lat', d.lat, 'lng', d.lng)
                    from depots d where d.id = p.start_depot_id),
    'end_depot', (select jsonb_build_object('name', d.name, 'address', d.address, 'lat', d.lat, 'lng', d.lng)
                  from depots d where d.id = p.end_depot_id),
    'stops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id, 'seq', st.seq, 'eta', st.eta,
        'name', pk.name, 'phone', pk.phone, 'address_line', pk.address_line, 'city', pk.city,
        'zip', pk.zip, 'book_count', pk.book_count, 'notes', pk.notes, 'status', pk.status,
        'lat', pk.lat, 'lng', pk.lng, 'start_time', s.start_time, 'end_time', s.end_time
      ) order by st.seq)
      from route_stops st join pickups pk on pk.id = st.pickup_id join slots s on s.id = pk.slot_id
      where st.route_id = r.id), '[]'::jsonb)
  ) order by r.start_at), '[]'::jsonb)
  from routes r join route_plans p on p.id = r.plan_id
  where r.id in (select driver_route_ids()) and p.plan_date = p_date;
$$;

-- Mark a stop picked up (or undo). Drivers have no direct UPDATE on pickups,
-- so this definer function checks the stop is on the caller's own route.
create function driver_set_stop_status(p_stop_id uuid, p_picked_up boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pickup uuid;
  v_status pickup_status;
begin
  select st.pickup_id into v_pickup from route_stops st
  where st.id = p_stop_id and st.route_id in (select driver_route_ids());
  if v_pickup is null then perform app_error('stop_not_yours'); end if;

  select status into v_status from pickups where id = v_pickup for update;
  if v_status = 'cancelled' then perform app_error('pickup_cancelled'); end if;

  if p_picked_up then
    update pickups set status = 'picked_up', picked_up_at = coalesce(picked_up_at, now())
    where id = v_pickup;
  else
    update pickups set status = 'scheduled', picked_up_at = null where id = v_pickup;
  end if;
  perform write_audit(case when p_picked_up then 'driver_picked_up' else 'driver_undo' end, 'pickup', v_pickup);
  return jsonb_build_object('ok', true, 'status', case when p_picked_up then 'picked_up' else 'scheduled' end);
end;
$$;

revoke execute on function driver_route_ids(), driver_plan_ids(), driver_pickup_ids(),
  driver_routes(date), driver_set_stop_status(uuid, boolean) from public, anon;
grant execute on function driver_route_ids(), driver_plan_ids(), driver_pickup_ids(),
  driver_routes(date), driver_set_stop_status(uuid, boolean) to authenticated, service_role;
-- Policies are evaluated for anon too; with no auth.uid() these return nothing.
grant execute on function driver_route_ids(), driver_plan_ids(), driver_pickup_ids() to anon;
