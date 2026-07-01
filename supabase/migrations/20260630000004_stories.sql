-- Family Legacy — Stories & Remembrances (PRD 11, slice 4; the final slice).
--
-- Text-first "record a memory": a titled, Markdown story about the family, its
-- subjects, and optionally the album or timeline event it belongs to. Stories
-- surface on the people they're about, the album, and the timeline event.
--
--   * `stories`       — the memory itself. `created_by` is the member who
--                       recorded it (the "author"); optional `album_id`/`event_id`
--                       hang it off existing Legacy content.
--   * `story_people`  — subjects (points at `people`, like photo_people /
--                       event_people, so ancestors can be subjects).
--
-- Audio recording + transcription is deliberately deferred (see the PRD): prove
-- the text surface first.
--
-- Privacy posture matches the rest of Legacy: family-only (`not is_guest()`),
-- wiki-style edits, story delete narrowed to creator/admin.

create table public.stories (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text,                                            -- Markdown
  album_id   uuid references public.albums(id) on delete set null,
  event_id   uuid references public.events(id) on delete set null,
  created_by uuid references auth.users(id)    on delete set null,
  updated_by uuid references auth.users(id)    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The hub lists newest first; the person/album/event surfaces filter by link.
create index stories_created_at_idx on public.stories (created_at desc);
create index stories_album_idx on public.stories (album_id);
create index stories_event_idx on public.stories (event_id);

-- ----------------------------------------------------------------------------
-- story_people — subjects (members AND ancestors → `people`, not `profiles`).
-- ----------------------------------------------------------------------------
create table public.story_people (
  story_id  uuid not null references public.stories(id) on delete cascade,
  person_id uuid not null references public.people(id)  on delete cascade,
  added_by  uuid references auth.users(id) on delete set null,
  added_at  timestamptz not null default now(),
  primary key (story_id, person_id)
);

-- "which stories is this person in" (person page surface).
create index story_people_person_idx on public.story_people (person_id);

-- ----------------------------------------------------------------------------
-- RLS — family-only (hidden from guests), wiki-style edits.
-- ----------------------------------------------------------------------------
alter table public.stories enable row level security;
alter table public.story_people enable row level security;

-- ---- stories -------------------------------------------------------------
create policy "stories: family read"
  on public.stories for select
  to authenticated
  using (not public.is_guest());

create policy "stories: family insert"
  on public.stories for insert
  to authenticated
  with check (not public.is_guest());

create policy "stories: family update"
  on public.stories for update
  to authenticated
  using (not public.is_guest())
  with check (not public.is_guest());

-- A story is one person's recorded memory; narrow delete to its author or an
-- admin (consistent with album/event delete).
create policy "stories: author or admin delete"
  on public.stories for delete
  to authenticated
  using (not public.is_guest() and ((select auth.uid()) = created_by or public.is_admin()));

-- ---- story_people --------------------------------------------------------
create policy "story_people: family read"
  on public.story_people for select
  to authenticated
  using (not public.is_guest());

create policy "story_people: family insert"
  on public.story_people for insert
  to authenticated
  with check (not public.is_guest());

-- Tagging is curation; any family member may untag.
create policy "story_people: family delete"
  on public.story_people for delete
  to authenticated
  using (not public.is_guest());
