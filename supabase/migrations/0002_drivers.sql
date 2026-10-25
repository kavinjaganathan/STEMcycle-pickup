-- StemCycle Pickup: driver accounts and availability

-- Every new auth user gets a pending driver profile; the admin approves it.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Called by the server right after creating the auth user at sign-up.
create function register_driver(p_id uuid, p_full_name text, p_phone text, p_capacity int)
returns void
language sql as $$
  insert into profiles (id, full_name, phone, capacity_boxes)
  values (p_id, p_full_name, p_phone, p_capacity)
  on conflict (id) do update
    set full_name = excluded.full_name, phone = excluded.phone,
        capacity_boxes = excluded.capacity_boxes;
$$;

create function my_profile() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'email', u.email, 'full_name', p.full_name,
                            'phone', p.phone, 'capacity_boxes', p.capacity_boxes,
                            'status', p.status)
  from profiles p join auth.users u on u.id = p.id
  where p.id = auth.uid();
$$;

create function require_active_driver() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and status = 'active') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create function driver_update_profile(p_full_name text, p_phone text, p_capacity int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_old int;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select capacity_boxes into v_old from profiles where id = auth.uid() for update;
  update profiles set full_name = p_full_name, phone = p_phone, capacity_boxes = p_capacity
  where id = auth.uid();
  -- A smaller or bigger vehicle changes what fits on upcoming routes.
  if v_old is distinct from p_capacity then
    perform mark_weekend_dirty(h.avail_date)
    from (select distinct avail_date from driver_hours
          where driver_id = auth.uid() and avail_date >= current_date) h;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- My hours for every weekend day still open for changes.
create function driver_get_availability(p_now timestamptz default now()) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'first_hour', s.first_hour,
    'last_hour', s.last_hour,
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', d.d,
        'lock_at', weekend_lock_at(weekend_of(d.d)),
        'hours', coalesce((select jsonb_agg(h.hour order by h.hour) from driver_hours h
                           where h.driver_id = auth.uid() and h.avail_date = d.d), '[]'::jsonb)
      ) order by d.d)
      from open_weekend_dates(p_now) as d (d)), '[]'::jsonb)
  )
  from settings s where s.id;
$$;

-- Replace my hours for one weekend day.
create function driver_set_availability(p_date date, p_hours int[], p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_driver uuid := require_active_driver();
  v_first int;
  v_last int;
begin
  if p_date not in (select open_weekend_dates(p_now)) then
    perform app_error('availability_locked');
  end if;
  select first_hour, last_hour into v_first, v_last from settings where id;
  if exists (select 1 from unnest(p_hours) h where h < v_first or h >= v_last) then
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

select apply_grants();
