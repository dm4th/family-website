-- Family Trust Portal — booking schema fixes (idempotent reconciliation)
--
-- WHY THIS EXISTS
--   Migration 20260525000001_bookings.sql was applied to prod in its ORIGINAL
--   (buggy) form, then edited in place by a later fix commit. Because the
--   version is already recorded as applied, `supabase db push` SKIPS it — so
--   the security fixes baked into the edited file never reach prod via that
--   file. This migration carries those fixes as a NEW version so prod
--   converges to the reviewed state.
--
--   It is written to be safe whether the DB currently has:
--     (a) the original buggy 20260525000001 (prod), or
--     (b) the in-place-edited fixed 20260525000001 (any fresh checkout), or
--     (c) a partial state from a previous run of this migration.
--   Every statement is guarded against the already-correct case.
--
-- WHAT THE ORIGINAL (buggy) STATE LACKED
--   1. the btree_gist extension
--   2. a STRICT end_date > start_date CHECK (it shipped with `>=`, which
--      false-conflicts same-day turnover and permits zero-night holds)
--   3. the bookings_no_overlap GiST exclusion constraint (DB-level
--      double-booking guard)
--   4. the enforce_booking_transitions trigger that closes the
--      "member self-approves their own booking via PostgREST" hole
--
--   The RLS policies are IDENTICAL between the buggy and fixed versions, so
--   they are intentionally not touched here.

set search_path = public, extensions;

create extension if not exists btree_gist;

-- ============================================================================
-- 1. Reconcile the end_date CHECK: drop the loose `>=` variant if present,
--    add the strict `>` variant under a stable name if no `>` check exists.
--
--    NOTE: adding the strict check validates existing rows. If prod somehow
--    holds a zero-night booking (end_date = start_date), this will fail loudly
--    — which is the correct signal that the row needs fixing first. A closed
--    family portal at this stage is expected to have no such rows.
-- ============================================================================
do $$
declare
  c record;
begin
  -- Drop any CHECK on bookings that encodes the loose `end_date >= start_date`.
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'bookings'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%end_date >= start_date%'
  loop
    execute format('alter table public.bookings drop constraint %I', c.conname);
  end loop;

  -- Add the strict variant only if no `end_date > start_date` check exists yet
  -- (the fixed 20260525000001 ships one inline under an auto-generated name).
  if not exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'bookings'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%end_date > start_date%'
  ) then
    alter table public.bookings
      add constraint bookings_end_after_start check (end_date > start_date);
  end if;
end $$;

-- ============================================================================
-- 2. DB-level double-booking guard. Add the GiST exclusion constraint if it
--    isn't already present. Half-open '[)' matches the exclusive end_date so
--    same-day turnover is permitted; applies only to approved bookings.
--
--    NOTE: this validates existing approved rows. If prod already holds two
--    overlapping approved bookings, this fails loudly — resolve the conflict
--    before re-running.
-- ============================================================================
do $$
begin
  if not exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'bookings'
      and con.conname = 'bookings_no_overlap'
  ) then
    alter table public.bookings
      add constraint bookings_no_overlap exclude using gist (
        property_id with =,
        daterange(start_date, end_date, '[)') with &&
      ) where (status = 'approved');
  end if;
end $$;

-- ============================================================================
-- 3. enforce_booking_transitions — DB-level state machine that closes the
--    self-approve hole. `create or replace` + `drop trigger if exists` makes
--    this safe to (re-)apply. Body is identical to the fixed
--    20260525000001 so the two converge.
--
--    Non-admin paths:
--      * INSERT: status must be 'pending', or 'approved' only when
--        approved_by = requested_by (the auto-approve path). Pending inserts
--        may not carry approval columns.
--      * UPDATE: requester may only move status to 'pending'/'cancelled' and
--        may never modify approved_by / approved_at.
--    Admin paths (site admin or property admin) are unrestricted.
-- ============================================================================
create or replace function public.enforce_booking_transitions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean := public.is_admin()
    or public.is_property_admin(new.property_id);
begin
  if v_is_admin then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('pending', 'approved') then
      raise exception 'bookings: requester cannot insert with status %', new.status
        using errcode = 'check_violation';
    end if;
    if new.status = 'approved'
      and new.approved_by is distinct from new.requested_by then
      raise exception 'bookings: requester cannot approve as another user'
        using errcode = 'check_violation';
    end if;
    if new.status = 'pending'
      and (new.approved_by is not null or new.approved_at is not null) then
      raise exception 'bookings: pending insert cannot carry approval columns'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- UPDATE path (OLD is bound).
  if old.status not in ('pending', 'approved') then
    raise exception 'bookings: status % is final and cannot be edited by the requester', old.status
      using errcode = 'check_violation';
  end if;
  if new.status not in ('pending', 'cancelled') then
    raise exception 'bookings: only admins can set status to %', new.status
      using errcode = 'check_violation';
  end if;
  if new.approved_by is distinct from old.approved_by then
    raise exception 'bookings: requester cannot modify approved_by'
      using errcode = 'check_violation';
  end if;
  if new.approved_at is distinct from old.approved_at then
    raise exception 'bookings: requester cannot modify approved_at'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_booking_transitions() from public;

drop trigger if exists bookings_enforce_transitions on public.bookings;

create trigger bookings_enforce_transitions
  before insert or update on public.bookings
  for each row execute function public.enforce_booking_transitions();
