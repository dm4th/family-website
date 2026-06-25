-- Enrich Peter Mathieson (Dan's dad). His profile had no full_name, so the
-- people backfill left his row displaying the email; fill in both his profile
-- name (so the directory etc. read correctly) and his people-row details.
-- Idempotent: the profile name is only filled when blank.

update public.profiles
set full_name  = 'Peter Mathieson',
    updated_at = now()
where email = 'pfmathieson@gmail.com'
  and (full_name is null or trim(full_name) = '');

update public.people p
set display_name  = 'Peter Mathieson',
    given_name    = 'Peter',
    family_name   = 'Mathieson',
    birth_date    = date '1961-09-15',
    family_branch = 'Peter''s Family',
    bio           = 'Bibi and Drew''s youngest child',
    updated_at    = now()
from public.profiles pr
where p.profile_id = pr.id
  and pr.email = 'pfmathieson@gmail.com';
