-- Development seed: morning and afternoon slots for the next 14 days.
insert into slots (slot_date, start_time, end_time, capacity)
select current_date + d, t.start_time, t.end_time, 25
from generate_series(1, 14) as d
cross join (values ('09:00'::time, '12:00'::time), ('13:00'::time, '16:00'::time)) as t (start_time, end_time);
