-- Family Trust Portal — Guest Access (PRD 15)
--
-- THE FIRST REAL MEMBER/GUEST READ DIFFERENTIATION ACROSS THE DATABASE.
--
-- Until now every SELECT policy was effectively `to authenticated using (true)`
-- — any signed-in user (member OR guest) could read everything. The `guest`
-- role existed in the schema but was completely unenforced. This migration:
--
--   1. Adds the `property_guests` explicit grant table + helper functions
--      (is_guest / is_property_guest / can_view_property) mirroring the
--      property_admins pattern.
--   2. Rewrites every guest-relevant SELECT policy to be guest-aware: members
--      and admins keep full read (`not is_guest()` short-circuits to true),
--      guests are gated through a per-property grant or hidden entirely.
--   3. Adds `and not is_guest()` write guards so a guest can never mutate data
--      even via a direct PostgREST call with their own JWT.
--   4. Wires the deferred grant: an invitation can carry a property to grant,
--      and handle_new_user() materializes the property_guests row on first
--      sign-in.
--   5. Adds property_busy_ranges() — a redacted availability RPC so a guest can
--      see a property's busy/free calendar WITHOUT member identities.
--
-- Predicate ordering: always write `not public.is_guest() or <grant>` so the
-- cheap, cached is_guest() short-circuits and only guests pay the grant lookup.
--
-- Policy NAMES are kept identical to the originals (drop + recreate) so this
-- migration is the single authority on the changed policies and leaves no
-- orphaned duplicates.

set search_path = public, extensions;

-- ============================================================================
-- 1. property_guests — explicit, per-property read grant for guest profiles.
--    Mirrors property_admins almost exactly. Grant ≠ booking: the join is the
--    single authority RLS checks. booking_id is provenance only (nullable).
-- ============================================================================
create table public.property_guests (
  property_id uuid not null references public.properties(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id)   on delete cascade,
  booking_id  uuid references public.bookings(id) on delete set null, -- provenance
  granted_by  uuid references auth.users(id) on delete set null,
  expires_at  timestamptz,        -- optional; null = no expiry
  created_at  timestamptz not null default now(),
  primary key (property_id, profile_id)
);

create index property_guests_profile_idx
  on public.property_guests (profile_id);

-- ============================================================================
-- 2. Identity helpers (all security definer, stable, search_path = '',
--    execute granted to authenticated — same posture as is_admin/is_property_admin)
-- ============================================================================

-- is_guest(): is the caller's profile a guest (vs. member/admin)?
--
-- ⚠️ DELIBERATELY does NOT check `deactivated_at`. is_guest() decides which
-- access *bucket* a profile is in, and every read policy is `not is_guest()
-- or <grant>`. If a *deactivated* guest made this return false, `not is_guest()`
-- would be TRUE and they'd silently get MEMBER-level read access — a privilege
-- escalation in the wrong direction (deactivating would *widen* access). A guest
-- is a guest regardless of activation; deactivation is enforced separately
-- (grants are revoked on deactivation — see setMemberActivation in the app).
create or replace function public.is_guest()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles
     where id = (select auth.uid())
       and role = 'guest'
  );
$$;

revoke all on function public.is_guest() from public;
grant execute on function public.is_guest() to authenticated;

-- is_property_guest(uuid): does the caller hold an (unexpired) grant here?
create or replace function public.is_property_guest(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.property_guests
     where property_id = p_property_id
       and profile_id = (select auth.uid())
       and (expires_at is null or expires_at > now())
  );
$$;

revoke all on function public.is_property_guest(uuid) from public;
grant execute on function public.is_property_guest(uuid) to authenticated;

-- can_view_property(uuid): read-side analogue of canManageProperty.
-- True if the caller is a member/admin (sees all) OR a guest with a grant.
create or replace function public.can_view_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not public.is_guest() or public.is_property_guest(p_property_id);
$$;

revoke all on function public.can_view_property(uuid) from public;
grant execute on function public.can_view_property(uuid) to authenticated;

-- ============================================================================
-- 3. Deferred grant — an invitation can carry a property to grant on accept.
-- ============================================================================
alter table public.invitations
  add column if not exists grant_property_id uuid
    references public.properties(id) on delete set null;

-- Re-create handle_new_user() to also materialize the guest's property_guests
-- row from the invitation's grant_property_id. (security definer ⇒ bypasses the
-- property_guests insert policy, so granted_by is the inviter, not auth.uid().)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.invitations%rowtype;
  v_role text := 'member';
  v_full_name text;
  v_avatar_url text;
begin
  select *
    into v_invitation
    from public.invitations
   where lower(email) = lower(new.email)
     and status = 'pending'
     and (expires_at is null or expires_at > now())
   order by created_at desc
   limit 1;

  if found then
    v_role := v_invitation.role;
    update public.invitations
       set status = 'accepted',
           accepted_at = now()
     where id = v_invitation.id;
  end if;

  v_full_name :=
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    );
  v_avatar_url := new.raw_user_meta_data ->> 'avatar_url';

  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (new.id, new.email, v_full_name, v_avatar_url, v_role)
  on conflict (id) do nothing;

  -- Deferred guest grant: if the adopted invitation was a guest invite carrying
  -- a property, create the read grant now that the profile exists.
  if found
     and v_invitation.role = 'guest'
     and v_invitation.grant_property_id is not null then
    insert into public.property_guests (property_id, profile_id, granted_by)
    values (v_invitation.grant_property_id, new.id, v_invitation.invited_by)
    on conflict (property_id, profile_id) do nothing;
  end if;

  return new;
end;
$$;

-- ============================================================================
-- 4. RLS on property_guests
--    read   : members/admins see all; a guest sees only their own grants.
--    insert : non-guest members/admins only, as themselves (granted_by).
--             The `not is_guest()` check is what prevents a guest self-granting.
--    delete : grantor / any member / admin (i.e. any non-guest).
--    no UPDATE — modify by delete + insert.
-- ============================================================================
alter table public.property_guests enable row level security;

create policy "property_guests: member read all, guest read own"
  on public.property_guests for select
  to authenticated
  using (not public.is_guest() or profile_id = (select auth.uid()));

create policy "property_guests: members grant"
  on public.property_guests for insert
  to authenticated
  with check (
    not public.is_guest()
    and granted_by = (select auth.uid())
  );

create policy "property_guests: members revoke"
  on public.property_guests for delete
  to authenticated
  using (not public.is_guest());

-- ============================================================================
-- 5. Rewrite guest-aware SELECT policies + add write guards.
--    Each is drop-then-recreate with the SAME name.
-- ============================================================================

-- ---- profiles ----------------------------------------------------------
-- Guest reads ONLY their own row; members/admins read all.
drop policy if exists "profiles: authenticated read all" on public.profiles;
create policy "profiles: authenticated read all"
  on public.profiles for select
  to authenticated
  using (not public.is_guest() or id = (select auth.uid()));
-- (self update / admin update / admin delete unchanged. The
--  guard_profile_privileged_columns trigger still blocks a guest changing
--  their own role/deactivation, so no role self-escalation.)

-- ---- properties --------------------------------------------------------
drop policy if exists "properties: authenticated read all" on public.properties;
create policy "properties: authenticated read all"
  on public.properties for select
  to authenticated
  using (not public.is_guest() or public.is_property_guest(id));

-- wiki update was `using (true)`: now block guests outright.
drop policy if exists "properties: authenticated wiki update" on public.properties;
create policy "properties: authenticated wiki update"
  on public.properties for update
  to authenticated
  using (not public.is_guest())
  with check (not public.is_guest());

-- ---- property_contacts -------------------------------------------------
drop policy if exists "property_contacts: authenticated read" on public.property_contacts;
create policy "property_contacts: authenticated read"
  on public.property_contacts for select
  to authenticated
  using (not public.is_guest() or public.is_property_guest(property_id));

drop policy if exists "property_contacts: authenticated insert" on public.property_contacts;
create policy "property_contacts: authenticated insert"
  on public.property_contacts for insert
  to authenticated
  with check (not public.is_guest());

drop policy if exists "property_contacts: authenticated update" on public.property_contacts;
create policy "property_contacts: authenticated update"
  on public.property_contacts for update
  to authenticated
  using (not public.is_guest())
  with check (not public.is_guest());

drop policy if exists "property_contacts: authenticated delete" on public.property_contacts;
create policy "property_contacts: authenticated delete"
  on public.property_contacts for delete
  to authenticated
  using (not public.is_guest());

-- ---- photos ------------------------------------------------------------
-- Guests see only photos attached to a GRANTED property. Profile-only / legacy
-- photos (property_id is null) are invisible to guests.
drop policy if exists "photos: authenticated read" on public.photos;
create policy "photos: authenticated read"
  on public.photos for select
  to authenticated
  using (
    not public.is_guest()
    or (property_id is not null and public.is_property_guest(property_id))
  );

-- insert already self-scoped; additionally forbid guests from uploading.
drop policy if exists "photos: insert self only" on public.photos;
create policy "photos: insert self only"
  on public.photos for insert
  to authenticated
  with check ((select auth.uid()) = uploaded_by and not public.is_guest());

-- ---- photo_subjects (person tagging — family-only, hide from guests) ----
drop policy if exists "photo_subjects: authenticated read" on public.photo_subjects;
create policy "photo_subjects: authenticated read"
  on public.photo_subjects for select
  to authenticated
  using (not public.is_guest());

drop policy if exists "photo_subjects: authenticated insert" on public.photo_subjects;
create policy "photo_subjects: authenticated insert"
  on public.photo_subjects for insert
  to authenticated
  with check (not public.is_guest());

-- ---- revisions (edit history — hide from guests) -----------------------
drop policy if exists "revisions: authenticated read" on public.revisions;
create policy "revisions: authenticated read"
  on public.revisions for select
  to authenticated
  using (not public.is_guest());

drop policy if exists "revisions: insert self only" on public.revisions;
create policy "revisions: insert self only"
  on public.revisions for insert
  to authenticated
  with check ((select auth.uid()) = changed_by and not public.is_guest());

-- ---- bookings ----------------------------------------------------------
-- A guest reads ONLY their own booking rows (none, in v1 — guests don't book).
-- Availability for guests is served via the redacted property_busy_ranges() RPC
-- below, NOT by widening this policy — member identities never leak via RLS.
drop policy if exists "bookings: authenticated read" on public.bookings;
create policy "bookings: authenticated read"
  on public.bookings for select
  to authenticated
  using (not public.is_guest() or requested_by = (select auth.uid()));

-- v1: guests cannot request bookings. (Relax this guard + add UI to enable.)
drop policy if exists "bookings: insert own" on public.bookings;
create policy "bookings: insert own"
  on public.bookings for insert
  to authenticated
  with check (
    requested_by = (select auth.uid())
    and not public.is_guest()
  );

-- ---- people (Family Legacy keystone — family-only, hide from guests) ----
drop policy if exists "people: authenticated read all" on public.people;
create policy "people: authenticated read all"
  on public.people for select
  to authenticated
  using (not public.is_guest());

drop policy if exists "people: authenticated wiki insert" on public.people;
create policy "people: authenticated wiki insert"
  on public.people for insert
  to authenticated
  with check (not public.is_guest());

drop policy if exists "people: authenticated wiki update" on public.people;
create policy "people: authenticated wiki update"
  on public.people for update
  to authenticated
  using (not public.is_guest())
  with check (not public.is_guest());

-- ---- property_admins (a guest needn't know who admins a property) ------
drop policy if exists "property_admins: authenticated read" on public.property_admins;
create policy "property_admins: authenticated read"
  on public.property_admins for select
  to authenticated
  using (not public.is_guest());

-- ============================================================================
-- 6. property_busy_ranges(uuid) — redacted availability for guests.
--    Returns ONLY (start_date, end_date) of APPROVED bookings on a property the
--    caller is allowed to view. No requester, guest_count, or notes — busy/free
--    only. security definer so it can read bookings past the guest-scoped RLS,
--    but it re-checks can_view_property so a guest can't probe a non-granted
--    property's schedule.
-- ============================================================================
create or replace function public.property_busy_ranges(p_property_id uuid)
returns table (start_date date, end_date date)
language sql
stable
security definer
set search_path = ''
as $$
  select b.start_date, b.end_date
    from public.bookings b
   where b.property_id = p_property_id
     and b.status = 'approved'
     and public.can_view_property(p_property_id)
   order by b.start_date;
$$;

revoke all on function public.property_busy_ranges(uuid) from public;
grant execute on function public.property_busy_ranges(uuid) to authenticated;
