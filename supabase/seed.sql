-- Development seed: morning and afternoon slots for the next 14 days.
insert into slots (slot_date, start_time, end_time, capacity)
select current_date + d, t.start_time, t.end_time, 25
from generate_series(1, 14) as d
cross join (values ('09:00'::time, '12:00'::time), ('13:00'::time, '16:00'::time)) as t (start_time, end_time);

-- A depot (Frisco Public Library area) and two SUVs.
insert into depots (name, address, lat, lng, is_default)
values ('Main depot', '8000 Dallas Pkwy, Frisco, TX 75034', 33.1497, -96.8226, true);
insert into vehicles (name, type, capacity_books, max_route_min)
values ('SUV 1', 'SUV', 400, 240), ('SUV 2', 'SUV', 400, 240);
