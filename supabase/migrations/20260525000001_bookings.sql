-- Family Trust Portal — bookings + property booking-config columns
--
-- Per-property calendar with request/approve workflow. See
-- prds/06-property-booking.md.

set search_path = public, extensions;

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
  check (end_date >= start_date),
  check (guest_count >= 1)
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
-- RLS on bookings
--
-- Authorization model:
--   * SELECT: any authenticated family member
--   * INSERT: any authenticated member, only as themselves
--   * UPDATE (own): the requester, while status is pending or approved.
--     Business logic in the Server Action constrains exactly what they can
--     change (cancel; pending-only edits).
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
