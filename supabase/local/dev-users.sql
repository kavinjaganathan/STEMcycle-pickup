-- Local development drivers (PGlite only). Sign in at /login with "Sign in as".
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000002', 'driver1@stemcycle.local', now()),
  ('00000000-0000-4000-8000-000000000003', 'driver2@stemcycle.local', now()),
  ('00000000-0000-4000-8000-000000000004', 'driver3@stemcycle.local', now());
update profiles set full_name = 'Dana Driver', phone = '9725550101', capacity_boxes = 12,
  status = 'active' where id = '00000000-0000-4000-8000-000000000002';
update profiles set full_name = 'Sam Driver', phone = '9725550102', capacity_boxes = 8,
  status = 'active' where id = '00000000-0000-4000-8000-000000000003';
update profiles set full_name = 'Pat Pending', phone = '9725550103', capacity_boxes = 10
  where id = '00000000-0000-4000-8000-000000000004';

-- Availability for the next four weekends: Dana Sat 9-1 and Sun 1-4, Sam Sat 10-2.
insert into driver_hours (driver_id, avail_date, hour)
select '00000000-0000-4000-8000-000000000002'::uuid, d::date, h
from generate_series(current_date + 1, current_date + 28, interval '1 day') d,
     generate_series(9, 12) h
where extract(isodow from d) = 6
union all
select '00000000-0000-4000-8000-000000000002'::uuid, d::date, h
from generate_series(current_date + 1, current_date + 28, interval '1 day') d,
     generate_series(13, 15) h
where extract(isodow from d) = 7
union all
select '00000000-0000-4000-8000-000000000003'::uuid, d::date, h
from generate_series(current_date + 1, current_date + 28, interval '1 day') d,
     generate_series(10, 13) h
where extract(isodow from d) = 6;
