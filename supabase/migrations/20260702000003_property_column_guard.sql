-- Family Trust Portal — PRD 27 (1/2): property privileged-column guard
--
-- WHY THIS EXISTS
--   The "properties: authenticated wiki update" RLS policy
--   (20260629000002_guest_access.sql) is column-blind: any non-guest member
--   may UPDATE any property row. The app only lets ordinary members edit the
--   wiki fields (name, description, how_to, guidelines, amenities, …) and
--   gates status / max_guests / peak_period_ranges / hero_image_path behind
--   canManageProperty() in the Server Action — but that gate lives only in
--   the app. A member holding their own session token can PATCH those
--   columns directly via PostgREST and skip it entirely. Clearing
--   peak_period_ranges this way also removes the peak-approval control for
--   everyone (see PRD 27 gap #2, closed in 20260702000004).
--
-- WHAT THIS DOES
--   BEFORE UPDATE trigger mirroring guard_profile_privileged_columns
--   (20260523000002_rls.sql): the four privileged columns may only change
--   when the caller passes the same check the app uses — is_admin() OR
--   is_property_admin(id), i.e. canManageProperty() semantics. Wiki fields
--   stay open to any non-guest member; the RLS policy is untouched.

create or replace function public.guard_property_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_admin() or public.is_property_admin(old.id)) then
    if new.status is distinct from old.status then
      raise exception 'Only property admins can change status'
        using errcode = '42501';  -- insufficient_privilege
    end if;
    if new.max_guests is distinct from old.max_guests then
      raise exception 'Only property admins can change max guests'
        using errcode = '42501';
    end if;
    if new.peak_period_ranges is distinct from old.peak_period_ranges then
      raise exception 'Only property admins can change peak periods'
        using errcode = '42501';
    end if;
    if new.hero_image_path is distinct from old.hero_image_path then
      raise exception 'Only property admins can change the hero image'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_property_privileged_columns() from public;

drop trigger if exists properties_guard_privileged_columns on public.properties;

create trigger properties_guard_privileged_columns
  before update on public.properties
  for each row execute function public.guard_property_privileged_columns();
