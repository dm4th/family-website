-- Family Trust Portal — Member Deactivation Lockout (PRD 26)
--
-- THE HOLE: deactivating a member was cosmetic. setMemberActivation only
-- stamped profiles.deactivated_at and deleted the person's guest grants;
-- enforcement was by convention only (listing pages filter it out). No RLS
-- policy and no middleware check blocked a deactivated *member*, so they kept
-- full read/write to every core table — via the app AND direct PostgREST —
-- because the broad policies are `to authenticated using (true)` /
-- `not is_guest()`, and a deactivated member is still role='member'.
--
-- THE FIX (three layers; RLS is the guarantee, the rest are UX):
--
--   1. is_active() — a cached SECURITY DEFINER predicate: true iff the caller's
--      profile exists and deactivated_at is null.
--
--   2. A RESTRICTIVE `is_active()` policy on every authenticated-facing table
--      (+ the photos storage bucket). Restrictive policies are AND-combined
--      with the existing permissive policies, so this is a single, auditable
--      global gate: whatever a permissive policy allowed, the caller must ALSO
--      be active. We deliberately do NOT rewrite the ~40 existing permissive
--      policies (that would be error-prone and collide with sibling PRDs) — one
--      restrictive policy per table closes select/insert/update/delete at once.
--
--   3. revoke_user_sessions() — an admin-guarded SECURITY DEFINER RPC that
--      deletes the target's auth.sessions rows so a live session cannot refresh
--      into a new access token. RLS already denies data to the (still-valid,
--      ≤1h) current access token; this kills the refresh path so the logout is
--      permanent within one token lifetime. Called from setMemberActivation.
--
-- WHY a definer RPC instead of the service-role key the PRD floated: the whole
-- codebase already does privileged writes through admin-guarded SECURITY
-- DEFINER functions (is_admin, handle_new_user, ics_bookings_for_token). That
-- pattern is reliable, testable, and — for a security-hardening change — avoids
-- introducing an all-RLS-bypassing secret into the Next.js runtime for one
-- operation. (If we later want the service-role client for an op that genuinely
-- must bypass RLS from app code, add it then.)
--
-- COORDINATES WITH PRD 25 (ICS feed): PRD 25 makes ics_bookings_for_token()
-- reject a deactivated member's token; this PRD additionally rotates the token
-- on deactivate (in setMemberActivation) so leaked feed URLs die immediately.
-- The two are independent, defense-in-depth.

set search_path = public, extensions;

-- ============================================================================
-- 1. is_active(): is the caller's profile present and NOT deactivated?
--    Same posture as is_admin/is_guest — security definer so it can read
--    profiles past that table's own RLS, stable so `(select auth.uid())` is
--    evaluated once per statement, search_path='' so every reference is
--    schema-qualified.
--
--    Note: returns FALSE for a caller with no profile row (e.g. anon, or a
--    half-provisioned signup). That's the safe default — the restrictive
--    policies below then deny. handle_new_user() (definer) creates the profile
--    in the same transaction as the auth.users insert, so a real member always
--    has a row before their first authenticated request.
-- ============================================================================
create or replace function public.is_active()
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
       and deactivated_at is null
  );
$$;

revoke all on function public.is_active() from public;
grant execute on function public.is_active() to authenticated;

-- ============================================================================
-- 2. Restrictive "active only" gate on every authenticated-facing table.
--
--    A RESTRICTIVE policy is AND-ed with the union of the permissive policies,
--    so each of these means: "...and additionally, the caller must be active."
--    `for all` covers SELECT / INSERT / UPDATE / DELETE in one policy. USING
--    governs read/update/delete visibility; WITH CHECK governs insert/update
--    row validity — both just require is_active().
--
--    is_active() evaluates the ACTING user (auth.uid()), never the target row,
--    so an active admin (re)activating another profile always passes. A
--    deactivated user fails every command on every table.
-- ============================================================================

create policy "profiles: active only" on public.profiles
  as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

create policy "properties: active only" on public.properties
  as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

create policy "property_contacts: active only" on public.property_contacts
  as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

create policy "photos: active only" on public.photos
  as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

create policy "photo_subjects: active only" on public.photo_subjects
  as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

create policy "photo_people: active only" on public.photo_people
  as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

create policy "albums: active only" on public.albums
  as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

create policy "album_photos: active only" on public.album_photos
  as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

create policy "revisions: active only" on public.revisions
  as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

create policy "invitations: active only" on public.invitations
  as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

create policy "bookings: active only" on public.bookings
  as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

create policy "people: active only" on public.people
  as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

create policy "relationships: active only" on public.relationships
  as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

create policy "events: active only" on public.events
  as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

create policy "event_people: active only" on public.event_people
  as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

create policy "event_photos: active only" on public.event_photos
  as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

create policy "stories: active only" on public.stories
  as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

create policy "story_people: active only" on public.story_people
  as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

create policy "feedback: active only" on public.feedback
  as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

create policy "property_admins: active only" on public.property_admins
  as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

create policy "property_guests: active only" on public.property_guests
  as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

-- Storage: gate the photos bucket only. The `bucket_id <> 'photos'` escape
-- keeps this restrictive policy from touching any future bucket — for photos
-- objects it requires is_active(), for anything else it's a no-op (true).
create policy "photos bucket: active only" on storage.objects
  as restrictive for all to authenticated
  using (bucket_id <> 'photos' or public.is_active())
  with check (bucket_id <> 'photos' or public.is_active());

-- ============================================================================
-- 3. revoke_user_sessions(uuid): kill a user's live sessions at the source.
--
--    Deletes the target's auth.sessions rows (cascades to their refresh
--    tokens), so their current access token cannot be refreshed — combined with
--    the RLS gate above (which denies data to the still-valid current token)
--    and the middleware redirect, this makes deactivation a hard logout within
--    one access-token lifetime.
--
--    Admin-guarded INSIDE the function (not just via a grant) so it can be
--    granted to `authenticated` while still refusing every non-admin caller.
--    security definer so it runs as the migration owner, which can delete from
--    the auth schema; search_path='' so `auth.sessions` is resolved explicitly.
-- ============================================================================
create or replace function public.revoke_user_sessions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can revoke sessions'
      using errcode = '42501';  -- insufficient_privilege
  end if;
  delete from auth.sessions where user_id = p_user_id;
end;
$$;

revoke all on function public.revoke_user_sessions(uuid) from public;
grant execute on function public.revoke_user_sessions(uuid) to authenticated;
