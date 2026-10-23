-- Local development users (PGlite only). Sign in at /login with "Sign in as".
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'admin@stemcycle.local'),
  ('00000000-0000-4000-8000-000000000002', 'driver1@stemcycle.local'),
  ('00000000-0000-4000-8000-000000000003', 'driver2@stemcycle.local');
update profiles set role = 'admin', full_name = 'Alex Admin' where id = '00000000-0000-4000-8000-000000000001';
update profiles set full_name = 'Dana Driver' where id = '00000000-0000-4000-8000-000000000002';
update profiles set full_name = 'Sam Driver' where id = '00000000-0000-4000-8000-000000000003';
