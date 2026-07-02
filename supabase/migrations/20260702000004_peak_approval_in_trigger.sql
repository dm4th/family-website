-- Family Trust Portal — PRD 27 (2/2): peak-period approval enforced in the DB
--
-- WHY THIS EXISTS
--   enforce_booking_transitions (20260525150000_booking_fixes.sql) lets a
--   non-admin INSERT status='approved' whenever approved_by = requested_by —
--   the intended off-peak auto-approve path. The rule "peak-period dates
--   require admin approval" lives only in determineInitialStatus() in the
--   Server Action (src/lib/bookings.ts), so a member can INSERT an approved
--   booking on peak dates directly via PostgREST. Double-booking is still
--   blocked by the bookings_no_overlap GiST constraint, but the peak-fairness
--   control is bypassable.
--
-- WHAT THIS DOES
--   1. booking_touches_peak() — SQL mirror of isInPeakPeriod() in
--      src/lib/bookings.ts: peak_period_ranges is a jsonb array of
--      {start:"MM-DD", end:"MM-DD"} recurring annual windows, inclusive on
--      both ends, wrapping the year boundary when end < start. Stay nights
--      are the half-open [start_date, end_date) — the checkout day is not a
--      stay night. Malformed entries are skipped, matching the TS parser.
--   2. Re-creates enforce_booking_transitions with one added rule on the
--      non-admin INSERT path: status='approved' is only accepted when no
--      stay night touches a peak window. Everything else is byte-identical
--      to the 20260525150000 version; the trigger binding is unchanged.
--   The Server Action keeps its own check for fast UX feedback; the DB is
--   now authoritative.

create or replace function public.booking_touches_peak(
  p_property_id uuid,
  p_start_date date,
  p_end_date date  -- exclusive checkout day
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.properties p,
         jsonb_array_elements(p.peak_period_ranges) as r,
         generate_series(
           p_start_date::timestamp,
           (p_end_date - 1)::timestamp,
           interval '1 day'
         ) as night(d)
    where p.id = p_property_id
      -- Same bounds as parseMonthDay(): MM 01-12, DD 01-31. Entries that
      -- don't parse are ignored (never counted as peak), matching the app.
      and (r->>'start') ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
      and (r->>'end')   ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
      and (
        case
          when replace(r->>'start', '-', '')::int
             <= replace(r->>'end', '-', '')::int
          then to_char(night.d, 'MMDD')::int
                 between replace(r->>'start', '-', '')::int
                     and replace(r->>'end', '-', '')::int
          -- end calendar-before start (e.g. 12-22 → 01-02): wraps the year.
          else (to_char(night.d, 'MMDD')::int >= replace(r->>'start', '-', '')::int
             or to_char(night.d, 'MMDD')::int <= replace(r->>'end', '-', '')::int)
        end
      )
  );
$$;

revoke all on function public.booking_touches_peak(uuid, date, date) from public;

-- ============================================================================
-- enforce_booking_transitions — same state machine as 20260525150000, plus
-- the peak-approval rule on the non-admin INSERT path.
--
--   Non-admin paths:
--     * INSERT: status must be 'pending', or 'approved' only when
--       approved_by = requested_by (the auto-approve path) AND no stay night
--       falls in a peak window. Pending inserts may not carry approval
--       columns.
--     * UPDATE: requester may only move status to 'pending'/'cancelled' and
--       may never modify approved_by / approved_at. (No peak check needed:
--       a requester can never produce status='approved' via UPDATE, so
--       dates of an approved booking cannot be edited by non-admins.)
--   Admin paths (site admin or property admin) are unrestricted.
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
    if new.status = 'approved'
      and public.booking_touches_peak(new.property_id, new.start_date, new.end_date) then
      raise exception 'bookings: peak-period dates require admin approval'
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
