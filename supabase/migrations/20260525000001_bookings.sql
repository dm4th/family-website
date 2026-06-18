-- Family Trust Portal — bookings + property booking-config columns
--
-- Per-property calendar with request/approve workflow. See
-- prds/06-property-booking.md.
--
-- Date model (read once and remember everywhere):
--   * start_date is INCLUSIVE — the first night of the stay
--   * end_date is EXCLUSIVE — the checkout day, NOT a stay night
--   * A booking [Jun 14, Jun 21) = arrive Jun 14, depart Jun 21, 7 nights
--   * Same-day turnover works: A=[Jun 10, Jun 14) and B=[Jun 14, Jun 18) share
--     no nights, no conflict. (Internally consistent with the ICS export's
--     RFC 5545 DTEND-exclusive convention.)

set search_path = public, extensions;

create extension if not exists btree_gist;

-- ============================================================================
-- properties: booking-config columns.
--   max_guests          — optional cap per booking (null = no cap)
--   peak_period_ranges  — array of recurring MM-DD windows requiring approval.
--     Shape: [{ "start": "07-01", "end": "08-31" }, …]
--     A range whose end is calendar-before its start (e.g. 12-22 → 01-02)
--     wraps the year boundary.
-- ============================================================================
alter table public.properties
  add column if not exists max_guests integer
    check (max_guests is null or max_guests >= 1),
  add column if not exists peak_period_ranges jsonb not null default '[]'::jsonb;

-- ============================================================================
-- bookings — one row per request. Status flows pending → approved/declined
-- or → cancelled. Approved bookings block; pending ones warn.
-- ============================================================================
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  guest_count integer not null default 1,
  notes text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'cancelled')),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  cancellation_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Strict: depart must be at least one day after arrive (no zero-night holds).
  check (end_date > start_date),
  check (guest_count >= 1),
  -- HARD double-booking guard. Two approved bookings on the same property
  -- cannot share any range. Half-open '[)' matches the exclusive end_date
  -- semantics, so same-day turnover is allowed. This is the backstop —
  -- the Server Action's app-level re-check is the friendly UX layer, but
  -- this constraint is what guarantees correctness under concurrent admin
  -- approvals racing on overlapping pending bookings.
  constraint bookings_no_overlap exclude using gist (
    property_id with =,
    daterange(start_date, end_date, '[)') with &&
  ) where (status = 'approved')
);

-- Composite index tuned for the range-overlap query at the heart of the
-- booking flow: "given a property + a window, give me bookings of these
-- statuses that overlap". See
-- .agents/skills/supabase-postgres-best-practices/references/query-composite-indexes.md
create index bookings_property_status_dates_idx
  on public.bookings (property_id, status, start_date, end_date);

create index bookings_requested_by_idx
  on public.bookings (requested_by, created_at desc);

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- ============================================================================
-- enforce_booking_transitions — DB-level state machine
--
-- RLS alone can't express the rules we need (it sees NEW but not OLD on
-- update, and INSERT WITH CHECK can't observe "the requester can only
-- self-approve under the same conditions the Server Action checks").
-- This trigger enforces the meaningful invariants regardless of how the
-- row was written (PostgREST, server action, raw SQL via an authed key).
--
-- Admin paths (site admin or property admin for this property) are
-- unrestricted — those callers earned the right to flip any field.
--
-- Non-admin paths:
--   * On UPDATE the requester can only set status to 'pending' or
--     'cancelled', and can never touch approved_by / approved_at.
--     This is what closes the "member flips their own pending booking
--     to approved via PostgREST" hole that the prior RLS missed.
--   * On INSERT we accept the auto-approve shape (status='approved',
--     approved_by=requested_by) — the Server Action gates eligibility
--     by peak window + conflict. Direct PostgREST writes COULD still
--     bypass the peak-window check this way; that's an acknowledged
--     trust point in a closed family portal, and the exclusion
--     constraint above guarantees the worst harm (double-booking) is
--     impossible regardless.
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

create trigger bookings_enforce_transitions
  before insert or update on public.bookings
  for each row execute function public.enforce_booking_transitions();

-- ============================================================================
-- RLS on bookings
--
-- Authorization model:
--   * SELECT: any authenticated family member
--   * INSERT: any authenticated member, only as themselves. State-machine
--     constraints (status, approved_by) are enforced by the trigger above.
--   * UPDATE (own): the requester, while status is pending or approved.
--     The trigger enforces what they can actually change.
--   * UPDATE (admin): site admins OR property admins for this property
--   * DELETE: none — bookings are cancelled (soft), never hard-deleted
-- ============================================================================
alter table public.bookings enable row level security;

create policy "bookings: authenticated read"
  on public.bookings for select
  to authenticated
  using (true);

create policy "bookings: insert own"
  on public.bookings for insert
  to authenticated
  with check (requested_by = (select auth.uid()));

create policy "bookings: requester update own"
  on public.bookings for update
  to authenticated
  using (
    requested_by = (select auth.uid())
    and status in ('pending', 'approved')
  )
  with check (requested_by = (select auth.uid()));

create policy "bookings: site admin or property admin update"
  on public.bookings for update
  to authenticated
  using (
    public.is_admin()
    or public.is_property_admin(property_id)
  )
  with check (
    public.is_admin()
    or public.is_property_admin(property_id)
  );
