-- Optional demo data: a depot in Frisco. Drivers add their own availability.
update settings set
  depot_name = 'Main depot',
  depot_address = '8000 Dallas Pkwy, Frisco, TX 75034',
  depot_lat = 33.1497,
  depot_lng = -96.8226
where id;
