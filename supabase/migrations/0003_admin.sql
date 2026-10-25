-- StemCycle Pickup: admin functions
-- There is one shared admin login (credentials in environment variables). The
-- server checks the admin session and then calls these with the service role;
-- apply_grants() keeps them away from anon and signed-in drivers.

create function admin_list_pickups(p_from date, p_to date, p_statuses pickup_status[] default null)
returns jsonb
-- plpgsql: refers to the routing tables created in a later migration.
language plpgsql stable as $$
begin
  return (
  select coalesce(jsonb_agg(t order by t.slot_date, t.slot_hour, t.created_at), '[]'::jsonb)
  from (
    select p.id, p.name, p.email, p.phone, p.address_line, p.city, p.zip, p.textbook_type,
           p.book_count, p.est_boxes, p.notes, p.slot_date, p.slot_hour, p.status,
           p.geocode_status, p.lat, p.lng, p.created_at, p.picked_up_at, p.cancelled_at,
           p.route_issue, p.pinned_driver_id, pin.full_name as pinned_driver_name,
           (select pr.full_name from route_stops st
              join routes r on r.id = st.route_id
              join route_plans rp on rp.id = r.plan_id and rp.status = 'published'
              join profiles pr on pr.id = r.driver_id
            where st.pickup_id = p.id limit 1) as driver_name
    from pickups p left join profiles pin on pin.id = p.pinned_driver_id
    where p.slot_date between p_from and p_to
      and (p_statuses is null or p.status = any (p_statuses))
      and p.anonymized_at is null
  ) t);
end;
$$;

create function admin_set_pickup_status(p_id uuid, p_status pickup_status) returns jsonb
language plpgsql as $$
declare
  v_date date;
begin
  update pickups set
    status = p_status,
    picked_up_at = case when p_status = 'picked_up' then coalesce(picked_up_at, now()) else null end,
    cancelled_at = case when p_status = 'cancelled' then coalesce(cancelled_at, now()) else null end
  where id = p_id and anonymized_at is null
  returning slot_date into v_date;
  if not found then perform app_error('not_found'); end if;
  perform mark_weekend_dirty(v_date);
  perform write_audit('set_status_' || p_status, 'pickup', p_id);
  return jsonb_build_object('ok', true, 'slot_date', v_date);
end;
$$;

-- Override: keep this pickup on one driver's route (null = let routing decide).
create function admin_pin_pickup(p_id uuid, p_driver_id uuid) returns jsonb
language plpgsql as $$
declare
  v_date date;
begin
  if p_driver_id is not null
     and not exists (select 1 from profiles where id = p_driver_id and status = 'active') then
    perform app_error('driver_not_active');
  end if;
  update pickups set pinned_driver_id = p_driver_id
  where id = p_id and anonymized_at is null
  returning slot_date into v_date;
  if not found then perform app_error('not_found'); end if;
  perform write_audit(case when p_driver_id is null then 'unpin' else 'pin' end, 'pickup', p_id);
  return jsonb_build_object('ok', true, 'slot_date', v_date);
end;
$$;

-- ---------------------------------------------------------------------------
-- Drivers
-- ---------------------------------------------------------------------------

create function admin_list_drivers(p_now timestamptz default now()) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(t order by t.status, t.full_name), '[]'::jsonb)
  from (
    select p.id, u.email, p.full_name, p.phone, p.capacity_boxes, p.status, p.created_at,
           coalesce((
             select jsonb_agg(jsonb_build_object('date', d.avail_date, 'hours', d.hours)
                              order by d.avail_date)
             from (select h.avail_date, jsonb_agg(h.hour order by h.hour) as hours
                   from driver_hours h
                   where h.driver_id = p.id
                     and h.avail_date >= (p_now at time zone org_tz())::date
                   group by h.avail_date) d), '[]'::jsonb) as availability
    from profiles p join auth.users u on u.id = p.id
  ) t;
$$;

create function admin_update_driver(p_id uuid, p_status driver_status, p_capacity int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_old profiles;
begin
  select * into v_old from profiles where id = p_id for update;
  if not found then perform app_error('not_found'); end if;
  update profiles set status = p_status, capacity_boxes = p_capacity where id = p_id;
  if v_old.status is distinct from p_status or v_old.capacity_boxes is distinct from p_capacity then
    perform mark_weekend_dirty(d.avail_date)
    from (select distinct avail_date from driver_hours
          where driver_id = p_id and avail_date >= current_date) d;
  end if;
  perform write_audit('update_driver', 'profile', p_id);
  return jsonb_build_object(
    'previous_status', v_old.status,
    'email', (select email from auth.users where id = p_id),
    'full_name', v_old.full_name);
end;
$$;

-- ---------------------------------------------------------------------------
-- Settings (including the depot)
-- ---------------------------------------------------------------------------

create function admin_get_settings() returns jsonb
language sql stable as $$
  select to_jsonb(s) - 'id' from settings s where id;
$$;

create function admin_update_settings(p jsonb) returns jsonb
language plpgsql as $$
begin
  update settings set
    org_name = p ->> 'org_name',
    timezone = p ->> 'timezone',
    zip_allowlist = array(select jsonb_array_elements_text(p -> 'zip_allowlist')),
    email_display_name = p ->> 'email_display_name',
    reply_to = nullif(p ->> 'reply_to', ''),
    retention_days = (p ->> 'retention_days')::int,
    booking_weekends = (p ->> 'booking_weekends')::int,
    first_hour = (p ->> 'first_hour')::int,
    last_hour = (p ->> 'last_hour')::int,
    stops_per_driver_hour = (p ->> 'stops_per_driver_hour')::int,
    lock_time = (p ->> 'lock_time')::time,
    books_per_box = (p ->> 'books_per_box')::int,
    service_min_base = (p ->> 'service_min_base')::int,
    service_min_per_50_books = (p ->> 'service_min_per_50_books')::int,
    max_route_min = (p ->> 'max_route_min')::int,
    return_buffer_min = (p ->> 'return_buffer_min')::int,
    depot_name = p ->> 'depot_name',
    depot_address = p ->> 'depot_address',
    depot_lat = (p ->> 'depot_lat')::float8,
    depot_lng = (p ->> 'depot_lng')::float8,
    updated_at = now()
  where id;
  -- Routing inputs may have changed for every open weekend.
  perform mark_weekend_dirty(d) from open_weekend_dates() d;
  perform write_audit('update_settings', 'settings', null);
  return jsonb_build_object('ok', true);
end;
$$;

select apply_grants();
