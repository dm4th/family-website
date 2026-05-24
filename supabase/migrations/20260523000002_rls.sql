-- Family Trust Portal — Row Level Security
-- Policy summary (from prds/00-master-plan.md):
--   * Members see everything authed
--   * Wiki-style: any member can edit properties, contacts
--   * Photos: upload by anyone; modify by uploader or admin
--   * Invitations: admin-only
--   * Profile self-edit; admin can edit any
--
-- Notes:
--   * Always combine `to authenticated` with USING/WITH CHECK ownership predicates
--   * UPDATE needs both USING + WITH CHECK to prevent ownership reassignment
--   * Use `(select auth.uid())` so Postgres caches the result per statement

-- ============================================================================
-- is_admin(): caller-identity check that bypasses RLS on profiles.
-- Safe as security definer because it only inspects the caller's row.
-- ============================================================================
create or replace function public.is_admin()
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
       and role = 'admin'
       and deactivated_at is null
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ============================================================================
-- profiles
-- ============================================================================
alter table public.profiles enable row level security;

create policy "profiles: authenticated read all"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles: self update"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "profiles: admin update any"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "profiles: admin delete"
  on public.profiles for delete
  to authenticated
  using (public.is_admin());

-- INSERT is restricted: only handle_new_user (security definer) creates rows.
-- No INSERT policy = no client-side inserts permitted.

-- ============================================================================
-- properties
-- ============================================================================
alter table public.properties enable row level security;

create policy "properties: authenticated read all"
  on public.properties for select
  to authenticated
  using (true);

create policy "properties: authenticated wiki update"
  on public.properties for update
  to authenticated
  using (true)
  with check (true);

create policy "properties: admin insert"
  on public.properties for insert
  to authenticated
  with check (public.is_admin());

create policy "properties: admin delete"
  on public.properties for delete
  to authenticated
  using (public.is_admin());

-- ============================================================================
-- property_contacts (full wiki access)
-- ============================================================================
alter table public.property_contacts enable row level security;

create policy "property_contacts: authenticated read"
  on public.property_contacts for select
  to authenticated
  using (true);

create policy "property_contacts: authenticated insert"
  on public.property_contacts for insert
  to authenticated
  with check (true);

create policy "property_contacts: authenticated update"
  on public.property_contacts for update
  to authenticated
  using (true)
  with check (true);

create policy "property_contacts: authenticated delete"
  on public.property_contacts for delete
  to authenticated
  using (true);

-- ============================================================================
-- photos
-- ============================================================================
alter table public.photos enable row level security;

create policy "photos: authenticated read"
  on public.photos for select
  to authenticated
  using (true);

create policy "photos: insert self only"
  on public.photos for insert
  to authenticated
  with check ((select auth.uid()) = uploaded_by);

create policy "photos: uploader or admin update"
  on public.photos for update
  to authenticated
  using ((select auth.uid()) = uploaded_by or public.is_admin())
  with check ((select auth.uid()) = uploaded_by or public.is_admin());

create policy "photos: uploader or admin delete"
  on public.photos for delete
  to authenticated
  using ((select auth.uid()) = uploaded_by or public.is_admin());

-- ============================================================================
-- photo_subjects (open tagging; uploader/subject can untag)
-- ============================================================================
alter table public.photo_subjects enable row level security;

create policy "photo_subjects: authenticated read"
  on public.photo_subjects for select
  to authenticated
  using (true);

create policy "photo_subjects: authenticated insert"
  on public.photo_subjects for insert
  to authenticated
  with check (true);

create policy "photo_subjects: uploader, subject, or admin delete"
  on public.photo_subjects for delete
  to authenticated
  using (
    (select auth.uid()) = profile_id
    or public.is_admin()
    or exists (
      select 1 from public.photos p
       where p.id = photo_subjects.photo_id
         and p.uploaded_by = (select auth.uid())
    )
  );

-- ============================================================================
-- revisions (append-only audit log)
-- ============================================================================
alter table public.revisions enable row level security;

create policy "revisions: authenticated read"
  on public.revisions for select
  to authenticated
  using (true);

create policy "revisions: insert self only"
  on public.revisions for insert
  to authenticated
  with check ((select auth.uid()) = changed_by);

-- no UPDATE / DELETE policies — revisions are immutable

-- ============================================================================
-- invitations (admin-only)
-- ============================================================================
alter table public.invitations enable row level security;

create policy "invitations: admin read"
  on public.invitations for select
  to authenticated
  using (public.is_admin());

create policy "invitations: admin insert"
  on public.invitations for insert
  to authenticated
  with check (public.is_admin());

create policy "invitations: admin update"
  on public.invitations for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "invitations: admin delete"
  on public.invitations for delete
  to authenticated
  using (public.is_admin());

-- ============================================================================
-- Column-level guard: non-admins must not change role or deactivated_at
-- on their own profile (the "self update" policy passes the row-level check
-- but RLS doesn't restrict columns).
-- ============================================================================
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'Only admins can change role'
        using errcode = '42501';  -- insufficient_privilege
    end if;
    if new.deactivated_at is distinct from old.deactivated_at then
      raise exception 'Only admins can change deactivation status'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_profile_privileged_columns() from public;

create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();
