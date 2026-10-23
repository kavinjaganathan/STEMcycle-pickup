-- StemCycle Pickup: geocoding (Phase 3)

create table geocode_cache (
  address_hash text primary key,       -- sha256 of the normalized address (no plain text stored)
  lat double precision not null,
  lng double precision not null,
  quality text not null check (quality in ('exact', 'approximate')),
  created_at timestamptz not null default now()
);
alter table geocode_cache enable row level security; -- service role only

-- Single-row throttle so all server instances share Nominatim's 1 request/second limit.
create table geocode_throttle (
  id boolean primary key default true check (id),
  next_at timestamptz not null default now()
);
insert into geocode_throttle default values;
alter table geocode_throttle enable row level security;

-- Reserves the next request slot; returns milliseconds the caller must wait.
create function geocode_reserve(p_interval_ms int) returns int
language plpgsql as $$
declare
  v_at timestamptz;
begin
  update geocode_throttle
    set next_at = greatest(next_at, clock_timestamp()) + make_interval(secs => p_interval_ms / 1000.0)
  where id
  returning next_at - make_interval(secs => p_interval_ms / 1000.0) into v_at;
  return greatest(0, ceil(extract(epoch from (v_at - clock_timestamp())) * 1000))::int;
end;
$$;

create function geocode_cache_get(p_hash text) returns jsonb
language sql stable as $$
  select jsonb_build_object('lat', lat, 'lng', lng, 'quality', quality)
  from geocode_cache where address_hash = p_hash;
$$;

create function geocode_cache_put(p_hash text, p_lat float8, p_lng float8, p_quality text)
returns void
language sql as $$
  insert into geocode_cache (address_hash, lat, lng, quality)
  values (p_hash, p_lat, p_lng, p_quality)
  on conflict (address_hash) do update
    set lat = excluded.lat, lng = excluded.lng, quality = excluded.quality, created_at = now();
$$;

create function pickup_address(p_id uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', id, 'address_line', address_line, 'city', city, 'zip', zip)
  from pickups where id = p_id and anonymized_at is null;
$$;

create function pickups_pending_geocode(p_limit int) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'address_line', address_line,
                                               'city', city, 'zip', zip)), '[]'::jsonb)
  from (select * from pickups
        where geocode_status = 'pending' and status in ('pending', 'scheduled')
          and anonymized_at is null
        order by created_at limit p_limit) t;
$$;

create function set_pickup_geocode(p_id uuid, p_status geocode_status, p_lat float8, p_lng float8)
returns void
language sql as $$
  update pickups set geocode_status = p_status, lat = p_lat, lng = p_lng where id = p_id;
$$;

-- Admin: drop a pin by hand.
create function admin_set_pickup_location(p_id uuid, p_lat float8, p_lng float8) returns jsonb
language plpgsql as $$
begin
  perform require_admin();
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    perform app_error('invalid_location');
  end if;
  update pickups set lat = p_lat, lng = p_lng, geocode_status = 'ok' where id = p_id;
  if not found then perform app_error('not_found'); end if;
  perform write_audit('set_location', 'pickup', p_id);
  return jsonb_build_object('ok', true);
end;
$$;

-- Admin: correct the address; geocoding then runs again.
create function admin_update_pickup_address(p_id uuid, p_address_line text, p_city text, p_zip text)
returns jsonb
language plpgsql as $$
begin
  perform require_admin();
  update pickups set address_line = p_address_line, city = p_city, zip = p_zip,
    geocode_status = 'pending', lat = null, lng = null
  where id = p_id and anonymized_at is null;
  if not found then perform app_error('not_found'); end if;
  perform write_audit('update_address', 'pickup', p_id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function geocode_reserve(int), geocode_cache_get(text),
  geocode_cache_put(text, float8, float8, text), pickup_address(uuid),
  pickups_pending_geocode(int), set_pickup_geocode(uuid, geocode_status, float8, float8)
  from public, anon, authenticated;
grant execute on function geocode_reserve(int), geocode_cache_get(text),
  geocode_cache_put(text, float8, float8, text), pickup_address(uuid),
  pickups_pending_geocode(int), set_pickup_geocode(uuid, geocode_status, float8, float8)
  to service_role;
revoke execute on function admin_set_pickup_location(uuid, float8, float8),
  admin_update_pickup_address(uuid, text, text, text) from public, anon;
grant execute on function admin_set_pickup_location(uuid, float8, float8),
  admin_update_pickup_address(uuid, text, text, text) to authenticated, service_role;
