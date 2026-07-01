-- Family Legacy — Photo Archive (PRD 11, slice 1).
--
-- Gives old scans a home that isn't a living member's profile or a property:
--   * `albums`        — a titled, dated collection (e.g. "Squam, 1960s–1970s").
--   * `album_photos`  — many-to-many between albums and photos, with ordering.
--   * `photo_people`  — tag ANYONE (member or ancestor) in a photo. Additive to
--                       the existing `photo_subjects` (which keys on profiles and
--                       so can only tag living members) — see the note below.
--   * `photos` gains fuzzy dating (`taken_on` / `circa`) and an `is_archival`
--     flag so an archive scan can be uploaded without a profile/property.
--
-- Privacy posture mirrors the rest of Legacy: family-only, hidden from guests
-- (`not public.is_guest()`), wiki-style edits, deletes narrowed to creator/admin.
-- Archival photos carry `property_id = null`, so the existing photos read policy
-- (`property_id is not null and is_property_guest(...)`) already hides them from
-- guests — no extra guard needed there.

-- ----------------------------------------------------------------------------
-- photos: fuzzy dating + archival flag
-- ----------------------------------------------------------------------------
-- `taken_at` (existing) is a plain date used by profile/property galleries.
-- Archive scans usually have no exact day, so we add a fuzzy companion:
--   taken_on  — exact calendar date, when known
--   circa     — free-text approximation ("circa 1972", "summer 1968")
-- and an `is_archival` flag marking a photo as historical-archive material
-- (uploaded straight into an album, not attached to a profile/property).
alter table public.photos
  add column if not exists taken_on    date,
  add column if not exists circa       text,
  add column if not exists is_archival boolean not null default false;

-- Archive scans are family-wiki content: any member should be able to date one
-- and fix its caption, not only whoever uploaded it. The base photos UPDATE
-- policy is uploader-or-admin; add a permissive policy that lets any non-guest
-- member edit ARCHIVAL photos only (regular profile/property photos are
-- untouched). WITH CHECK keeps is_archival true, so this can't be used to
-- reclassify a normal photo into the archive-editable bucket.
create policy "photos: family edit archival"
  on public.photos for update
  to authenticated
  using (not public.is_guest() and is_archival)
  with check (not public.is_guest() and is_archival);

-- ----------------------------------------------------------------------------
-- albums
-- ----------------------------------------------------------------------------
create table public.albums (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  description    text,                                       -- Markdown
  era            text,                                       -- e.g. "1960s–1970s"
  cover_photo_id uuid references public.photos(id) on delete set null,
  created_by     uuid references auth.users(id)    on delete set null,
  updated_by     uuid references auth.users(id)    on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index albums_created_at_idx on public.albums (created_at desc);

-- ----------------------------------------------------------------------------
-- album_photos (many-to-many, ordered)
-- ----------------------------------------------------------------------------
create table public.album_photos (
  album_id   uuid not null references public.albums(id) on delete cascade,
  photo_id   uuid not null references public.photos(id) on delete cascade,
  sort_order integer not null default 0,
  added_by   uuid references auth.users(id) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (album_id, photo_id)
);

-- Album view lists its photos in (sort_order, added_at) order.
create index album_photos_album_idx on public.album_photos (album_id, sort_order, added_at);
-- "which albums is this photo in" (photo detail / delete cleanup).
create index album_photos_photo_idx on public.album_photos (photo_id);

-- ----------------------------------------------------------------------------
-- photo_people (tag members AND ancestors — points at `people`, not `profiles`)
-- ----------------------------------------------------------------------------
-- Why a NEW table rather than repointing `photo_subjects`: `photo_subjects`
-- keys on `profile_id → profiles` (living members only) and powers the auto-tag
-- on profile upload. Ancestors have no profiles row. Keeping this additive
-- leaves the existing profile-tagging path untouched and lets one photo tag
-- both members (via photo_subjects) and ancestors (via photo_people).
create table public.photo_people (
  photo_id  uuid not null references public.photos(id)  on delete cascade,
  person_id uuid not null references public.people(id)  on delete cascade,
  added_by  uuid references auth.users(id) on delete set null,
  added_at  timestamptz not null default now(),
  primary key (photo_id, person_id)
);

-- "which photos is this person in" (person page, timeline later).
create index photo_people_person_idx on public.photo_people (person_id);

-- ----------------------------------------------------------------------------
-- RLS — family-only (hidden from guests), wiki-style edits.
-- ----------------------------------------------------------------------------
alter table public.albums enable row level security;
alter table public.album_photos enable row level security;
alter table public.photo_people enable row level security;

-- ---- albums --------------------------------------------------------------
create policy "albums: family read"
  on public.albums for select
  to authenticated
  using (not public.is_guest());

create policy "albums: family insert"
  on public.albums for insert
  to authenticated
  with check (not public.is_guest());

create policy "albums: family update"
  on public.albums for update
  to authenticated
  using (not public.is_guest())
  with check (not public.is_guest());

-- Deleting an album is destructive (drops its curation); narrow to the album's
-- creator or a site admin, consistent with photo delete authorization.
create policy "albums: creator or admin delete"
  on public.albums for delete
  to authenticated
  using (not public.is_guest() and ((select auth.uid()) = created_by or public.is_admin()));

-- ---- album_photos --------------------------------------------------------
create policy "album_photos: family read"
  on public.album_photos for select
  to authenticated
  using (not public.is_guest());

create policy "album_photos: family insert"
  on public.album_photos for insert
  to authenticated
  with check (not public.is_guest());

-- Removing a photo from an album is a curation edit (the photo itself survives),
-- so any family member may do it — matches the wiki-edit posture on albums.
create policy "album_photos: family delete"
  on public.album_photos for delete
  to authenticated
  using (not public.is_guest());

-- ---- photo_people --------------------------------------------------------
create policy "photo_people: family read"
  on public.photo_people for select
  to authenticated
  using (not public.is_guest());

create policy "photo_people: family insert"
  on public.photo_people for insert
  to authenticated
  with check (not public.is_guest());

-- Untag: the photo's uploader or a site admin (mirrors photo_subjects, minus
-- the subject clause — an ancestor person has no login to authorize itself).
create policy "photo_people: uploader or admin delete"
  on public.photo_people for delete
  to authenticated
  using (
    not public.is_guest()
    and (
      public.is_admin()
      or exists (
        select 1 from public.photos p
         where p.id = photo_people.photo_id
           and p.uploaded_by = (select auth.uid())
      )
    )
  );
