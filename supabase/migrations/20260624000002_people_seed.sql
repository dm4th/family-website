-- Seed the `people` table from Dan's initial family-tree CSV.
--
-- Reconciliation note: the structural migration backfills one `people` row per
-- existing profile. Of this batch, only "Dan Mathieson" overlaps an existing
-- profile (full_name "Daniel Mathieson"), so we ENRICH that backfilled row
-- rather than insert a duplicate. The other six are new people with no login
-- (profile_id null). Idempotent: re-running pushes nothing new.

-- 1) Enrich the already-backfilled member row for Dan (matched via his login).
update public.people p
set display_name  = 'Dan Mathieson',
    given_name    = 'Daniel',
    family_name   = 'Mathieson',
    birth_date    = date '1994-01-04',
    family_branch = 'Peter''s Family',
    bio           = 'Maggie''s Husband, Peter''s Son',
    updated_at    = now()
from public.profiles pr
where p.profile_id = pr.id
  and pr.email = 'danny.mathieson233@gmail.com';

-- 2) Insert the rest as new (loginless) people. Guarded by display_name so a
--    repeated `supabase db push` is a no-op.
insert into public.people
  (display_name, given_name, family_name, birth_date, family_branch, bio)
select v.display_name, v.given_name, v.family_name, v.birth_date,
       v.family_branch, v.bio
from (
  values
    ('Maggie Larsen',          'Margaret', 'Larsen',          date '1996-08-24', 'Peter''s Family', 'Dan''s Wife'),
    ('Miche Mathieson',        'Michelle', 'Mathieson',       null::date,        'Peter''s Family', 'Mike''s Wife'),
    ('Mike Mathieson',         'Michael',  'Mathieson',       date '1995-05-20', 'Peter''s Family', 'Miche''s Husband, Peter''s Son'),
    ('Drew Mathieson',         'Drew',     'Mathieson',       date '1996-07-03', 'Andy''s Family',  'Andy''s Son'),
    ('CC Conver',              'Caroline', 'Conver',          null::date,        'Peggy''s Family', 'Peggy''s Daughter'),
    ('Peggy Mathieson-Conver', 'Margaret', 'Mathieson-Conver', null::date,       'Peggy''s Family', 'Eldest of Bibi and Drew''s children')
) as v(display_name, given_name, family_name, birth_date, family_branch, bio)
where not exists (
  select 1 from public.people p where p.display_name = v.display_name
);
