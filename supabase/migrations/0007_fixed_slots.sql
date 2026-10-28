-- Fixed pickup times. Residents book from a few set hours on Saturday and
-- Sunday (chosen in Settings), whether or not a driver has signed up yet, up
-- to slot_limit bookings per hour. Drivers then pick which of those hours they
-- can cover; bookings nobody covers show as unassigned on the Routes page.
-- first_hour, last_hour and stops_per_driver_hour are no longer used.

create function valid_hours(p int[]) returns boolean
language sql immutable as $$
  select coalesce(bool_and(h between 0 and 23), true) from unnest(p) h;
$$;

alter table settings
  add column sat_hours int[] not null default '{10,11}' check (valid_hours(sat_hours)),
  add column sun_hours int[] not null default '{13,14}' check (valid_hours(sun_hours)),
  add column slot_limit int not null default 8 check (slot_limit between 1 and 100);

-- The pickup hours offered on a Saturday or Sunday.
create function pickup_hours(p_date date) returns int[]
language sql stable security definer set search_path = public as $$
  select case extract(isodow from p_date)
           when 6 then sat_hours when 7 then sun_hours else '{}'::int[] end
  from settings where id;
$$;

create or replace function slot_capacity(p_date date, p_hour int) returns int
language sql stable security definer set search_path = public as $$
  select case when p_hour = any (pickup_hours(p_date)) then slot_limit else 0 end
  from settings where id;
$$;

-- Bookable 1-hour slots: the set pickup hours that haven't started or filled up.
create or replace function available_slots(p_now timestamptz default now()) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'slot_date', t.d, 'hour', t.h, 'remaining', t.cap - t.booked)
         order by t.d, t.h), '[]'::jsonb)
  from (
    select d.d, h.h, s.slot_limit as cap, slot_booked(d.d, h.h) as booked
    from settings s,
         open_weekend_dates(p_now) as d (d),
         unnest(pickup_hours(d.d)) as h (h)
    where s.id and slot_starts_at(d.d, h.h) > p_now
  ) t
  where t.cap > t.booked;
$$;

-- My hours for every open weekend day, plus each pickup hour's bookings and
-- how many drivers already cover it (counts only), so drivers can fill gaps.
create or replace function driver_get_availability(p_now timestamptz default now()) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'timezone', s.timezone,
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', d.d,
        'lock_at', weekend_lock_at(weekend_of(d.d)),
        'hours', coalesce((select jsonb_agg(h.hour order by h.hour) from driver_hours h
                           where h.driver_id = auth.uid() and h.avail_date = d.d), '[]'::jsonb),
        'slots', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'hour', ph.h,
                   'booked', slot_booked(d.d, ph.h),
                   'drivers', (select count(*) from driver_hours dh
                               join profiles p on p.id = dh.driver_id
                               where dh.avail_date = d.d and dh.hour = ph.h
                                 and p.status = 'active'))
                 order by ph.h)
          from unnest(pickup_hours(d.d)) as ph (h)), '[]'::jsonb)
      ) order by d.d)
      from open_weekend_dates(p_now) as d (d)), '[]'::jsonb)
  )
  from settings s where s.id;
$$;

-- Replace my hours for one weekend day; only the set pickup hours are allowed.
create or replace function driver_set_availability(p_date date, p_hours int[],
                                                   p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_driver uuid := require_active_driver();
begin
  if p_date not in (select open_weekend_dates(p_now)) then
    perform app_error('availability_locked');
  end if;
  if exists (select 1 from unnest(p_hours) h where not (h = any (pickup_hours(p_date)))) then
    perform app_error('hours_out_of_range');
  end if;

  delete from driver_hours where driver_id = v_driver and avail_date = p_date;
  insert into driver_hours (driver_id, avail_date, hour)
  select distinct v_driver, p_date, h from unnest(p_hours) h;

  perform mark_weekend_dirty(p_date);
  perform write_audit('set_availability', 'profile', v_driver);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function admin_update_settings(p jsonb) returns jsonb
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
    sat_hours = array(select distinct x::int from jsonb_array_elements_text(p -> 'sat_hours') x
                      order by 1),
    sun_hours = array(select distinct x::int from jsonb_array_elements_text(p -> 'sun_hours') x
                      order by 1),
    slot_limit = (p ->> 'slot_limit')::int,
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
