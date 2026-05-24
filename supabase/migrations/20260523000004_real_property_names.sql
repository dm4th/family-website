-- Family Trust Portal — rename placeholder properties to real names,
-- and add Mumford's Motel in Big Sky.
--
-- Existing rows from 20260523000003_seed.sql get renamed by slug.
-- Mumford's Motel is inserted fresh.

update public.properties
   set slug = 'loon-a-see',
       name = 'Loon-A-See',
       location = 'Squam Lake, New Hampshire'
 where slug = 'loon-lake';

update public.properties
   set slug = 'loon-e-bin',
       name = 'Loon-E-Bin',
       location = 'Squam Lake, New Hampshire'
 where slug = 'loon-cabin';

insert into public.properties (slug, name, location, description, how_to, guidelines)
values (
  'mumfords-motel',
  e'Mumford\'s Motel',
  'Big Sky, Montana',
  'The Big Sky place. Update this description with whatever the family wants people to know.',
  e'## How things work here\n\n- TBD\n\nEdit as a family — every change is logged.',
  e'## House rules\n\n- TBD\n\nEdit as a family.'
)
on conflict (slug) do nothing;
