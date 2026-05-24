-- Family Trust Portal — property_admins
--
-- Per-property admin role for managing a specific property's lifecycle
-- (status, hero image, others' photos). Site-level admins (profiles.role
-- = 'admin') retain full access; property admins get elevated rights
-- scoped to their assigned properties.

create table public.property_admins (
  property_id uuid not null references public.properties(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (property_id, profile_id)
);

create index property_admins_profile_idx
  on public.property_admins (profile_id);

-- ============================================================================
-- is_property_admin(uuid) — does the caller administer this property?
-- security definer so it bypasses RLS on the lookup; safe because it only
-- inspects the caller's own auth.uid().
-- ============================================================================
create or replace function public.is_property_admin(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.property_admins
     where property_id = p_property_id
       and profile_id = (select auth.uid())
  );
$$;

revoke all on function public.is_property_admin(uuid) from public;
grant execute on function public.is_property_admin(uuid) to authenticated;

-- ============================================================================
-- RLS on property_admins
-- ============================================================================
alter table public.property_admins enable row level security;

create policy "property_admins: authenticated read"
  on public.property_admins for select
  to authenticated
  using (true);

create policy "property_admins: site admin or existing prop admin can grant"
  on public.property_admins for insert
  to authenticated
  with check (
    public.is_admin()
    or public.is_property_admin(property_id)
  );

create policy "property_admins: site admin or existing prop admin can revoke"
  on public.property_admins for delete
  to authenticated
  using (
    public.is_admin()
    or public.is_property_admin(property_id)
  );

-- No UPDATE policy — relationships are either present or not; modify by
-- delete + insert.
