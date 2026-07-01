-- Family Legacy — Timeline (PRD 11, slice 3; detailed spec in PRD 10).
--
-- The chronological spine of the family. Two sources feed one stream:
--   * `events`         — narrative anchors ("Christmas 1998", "Peggy's wedding").
--   * dated archive     — `photos.taken_on` / `circa` already carry a year, so the
--     scans from slice 1 auto-assemble into the timeline with no extra tagging.
--
-- Subjects point at `people` (NOT `profiles`), mirroring the slice-1 `photo_people`
-- decision, so ancestors can be event subjects and the person/branch filter works
-- across everyone. Privacy posture matches the rest of Legacy: family-only
-- (`not public.is_guest()`), wiki-style edits, deletes narrowed.

-- ----------------------------------------------------------------------------
-- events
-- ----------------------------------------------------------------------------
-- Fuzzy dating like the archive: an exact `event_date` when the day is known,
-- else an `event_circa` phrase. `event_year` is the canonical bucket the
-- timeline groups + sorts by, and is ALWAYS set (derived at write time from the
-- exact date's year or a year parsed from the circa phrase) so grouping never
-- has to reason about fuzzy text.
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,                                          -- Markdown
  event_date  date,                                          -- exact, when known
  event_circa text,                                          -- fuzzy: "summer 1968"
  event_year  integer not null,                              -- canonical grouping year
  location    text,
  tags        text[] not null default '{}',                  -- themed curation (future)
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Timeline reads newest-year-first; index the grouping column.
create index events_year_idx on public.events (event_year desc, event_date desc);

-- ----------------------------------------------------------------------------
-- event_people — tag members AND ancestors as subjects of an event (points at
-- `people`, not `profiles`, exactly like photo_people).
-- ----------------------------------------------------------------------------
create table public.event_people (
  event_id  uuid not null references public.events(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  added_by  uuid references auth.users(id) on delete set null,
  added_at  timestamptz not null default now(),
  primary key (event_id, person_id)
);

create index event_people_person_idx on public.event_people (person_id);

-- ----------------------------------------------------------------------------
-- event_photos — curate specific archive photos onto an event (ordered M:N).
-- ----------------------------------------------------------------------------
create table public.event_photos (
  event_id   uuid not null references public.events(id) on delete cascade,
  photo_id   uuid not null references public.photos(id) on delete cascade,
  sort_order integer not null default 0,
  added_by   uuid references auth.users(id) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (event_id, photo_id)
);

create index event_photos_event_idx on public.event_photos (event_id, sort_order, added_at);
create index event_photos_photo_idx on public.event_photos (photo_id);

-- ----------------------------------------------------------------------------
-- RLS — family-only (hidden from guests), wiki-style edits.
-- ----------------------------------------------------------------------------
alter table public.events enable row level security;
alter table public.event_people enable row level security;
alter table public.event_photos enable row level security;

-- ---- events --------------------------------------------------------------
create policy "events: family read"
  on public.events for select
  to authenticated
  using (not public.is_guest());

create policy "events: family insert"
  on public.events for insert
  to authenticated
  with check (not public.is_guest());

create policy "events: family update"
  on public.events for update
  to authenticated
  using (not public.is_guest())
  with check (not public.is_guest());

-- Deleting an event drops its narrative + curation; narrow to creator or admin
-- (consistent with album delete).
create policy "events: creator or admin delete"
  on public.events for delete
  to authenticated
  using (not public.is_guest() and ((select auth.uid()) = created_by or public.is_admin()));

-- ---- event_people --------------------------------------------------------
create policy "event_people: family read"
  on public.event_people for select
  to authenticated
  using (not public.is_guest());

create policy "event_people: family insert"
  on public.event_people for insert
  to authenticated
  with check (not public.is_guest());

-- Tagging is curation (the person/event survive); any family member may untag.
create policy "event_people: family delete"
  on public.event_people for delete
  to authenticated
  using (not public.is_guest());

-- ---- event_photos --------------------------------------------------------
create policy "event_photos: family read"
  on public.event_photos for select
  to authenticated
  using (not public.is_guest());

create policy "event_photos: family insert"
  on public.event_photos for insert
  to authenticated
  with check (not public.is_guest());

create policy "event_photos: family delete"
  on public.event_photos for delete
  to authenticated
  using (not public.is_guest());
