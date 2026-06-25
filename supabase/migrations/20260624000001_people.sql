-- Family Legacy — the `people` table (PRD 11 keystone), built alongside the
-- PRD 12 PeoplePicker so subject-tagging has a real backing store.
--
-- `people` = every human the family wants to record, living or not. A living
-- member's row links to their `profiles` row via `profile_id`; ancestors who
-- will never log in have `profile_id = null`. Photo tags, tree edges, event
-- subjects, and stories will all reference `people` (not `profiles`) so the
-- archive, tree, timeline, and stories share one backbone.

create table public.people (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null,                              -- how they're shown
  given_name    text,
  family_name   text,
  birth_date    date,                                       -- exact, when known
  birth_circa   text,                                       -- fuzzy: "circa 1940"
  death_date    date,                                       -- null ⇒ presumed living
  death_circa   text,
  family_branch text,                                       -- e.g. "Peter's family"
  bio           text,                                       -- Markdown
  photo_id      uuid references public.photos(id)   on delete set null,
  profile_id    uuid references public.profiles(id) on delete set null,
  created_by    uuid references auth.users(id)      on delete set null,
  updated_by    uuid references auth.users(id)      on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- At most one person per living member.
create unique index people_profile_id_key
  on public.people (profile_id)
  where profile_id is not null;

-- Typeahead + grouping. The table is small (a few dozen rows), so a plain
-- btree plus ILIKE search is more than enough — no pg_trgm needed.
create index people_display_name_idx on public.people (display_name);
create index people_family_branch_idx on public.people (family_branch);

-- ----------------------------------------------------------------------------
-- Backfill: one `people` row per existing profile (the living members), so the
-- tree gets its living nodes for free and future photo subjects can point at
-- people immediately. Idempotent via the unique partial index above.
-- ----------------------------------------------------------------------------
insert into public.people (display_name, family_branch, profile_id)
select coalesce(nullif(trim(p.full_name), ''), p.email),
       p.family_branch,
       p.id
from public.profiles p
on conflict (profile_id) where profile_id is not null do nothing;

-- ----------------------------------------------------------------------------
-- RLS — same posture as the rest of the site: every authenticated member can
-- read everything and add/edit wiki-style; deletes are admin-only because
-- removing a person would orphan future tags/edges/stories.
-- ----------------------------------------------------------------------------
alter table public.people enable row level security;

create policy "people: authenticated read all"
  on public.people for select
  to authenticated
  using (true);

create policy "people: authenticated wiki insert"
  on public.people for insert
  to authenticated
  with check (true);

create policy "people: authenticated wiki update"
  on public.people for update
  to authenticated
  using (true)
  with check (true);

create policy "people: admin delete"
  on public.people for delete
  to authenticated
  using (public.is_admin());
