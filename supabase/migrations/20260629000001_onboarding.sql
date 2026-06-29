-- Family Trust Portal — first-login onboarding flag (PRD 13)
--
-- A single nullable timestamp drives the dismissible welcome panel on the
-- dashboard:
--
--   * profiles.onboarded_at — null means "this member hasn't been welcomed yet"
--     (show the panel); a timestamp means they've dismissed it (hide it). Set
--     once when the member taps "Got it" on the welcome panel, or implicitly the
--     first time they act. Because the value persists per-row, the panel stays
--     dismissed across reloads and devices. Nulling it again (admin/SQL) re-shows
--     the panel — handy after a big change worth re-orienting the family on.
--
-- No new RLS or trigger work is needed:
--   - the existing "profiles: self update" policy already lets a member write
--     their own row, and
--   - guard_profile_privileged_columns() only blocks role / deactivated_at for
--     non-admins, so a self-write of onboarded_at passes.

set search_path = public, extensions;

alter table public.profiles
  add column if not exists onboarded_at timestamptz;

comment on column public.profiles.onboarded_at is
  'When the member dismissed the first-login welcome panel. Null = not yet welcomed (show it).';
