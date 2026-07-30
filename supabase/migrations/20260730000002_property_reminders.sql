-- Property reminders (PRD 32, slice 3) — dated obligations on a property.
--
-- WHY THIS TABLE EXISTS. Slice 3 of Smart Intake reads a due date off a bill and
-- offers to put it on the calendar. It was written assuming an "existing
-- calendar/event create action" to route that through. There isn't one:
--
--   * `bookings` are stays — start/end, guest_count, an approval workflow. A bill
--     due date is not a stay and has none of those.
--   * `events` is the Family Legacy Timeline (PRD 11): narrative anchors with a
--     NOT NULL event_year and no property_id. Filing "Water bill due" there would
--     put a utility bill on the family history spine.
--
-- So the reminder model is built here, first, as ordinary property data a member
-- can add by hand. Smart Intake then pre-fills it like any other form — it is a
-- consumer of this table, never a privileged path into it.
--
-- WHAT A REMINDER IS: a title, a date, optional notes, and an optional repeat.
-- It is deliberately NOT a ledger — there is no amount column, no paid/unpaid
-- state, no payment integration (PRD 32 puts those explicitly out of scope). An
-- amount lives in `notes` as free text, the way it would if you wrote it on a
-- calendar square.

-- ============================================================================
-- Table
-- ============================================================================
create table if not exists public.property_reminders (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  title text not null,
  notes text,
  due_date date not null,

  -- Repeats are stored as a rule, not as materialized rows: one reminder that
  -- recurs is one row, expanded for display over whatever window is on screen
  -- (see src/lib/reminders.ts) and emitted as an RRULE in the calendar feed.
  -- Materializing would mean guessing how far into the future to write, and
  -- would turn "fix the date" into "fix it in eighty places".
  recurrence text not null default 'none'
    check (recurrence in ('none', 'monthly', 'quarterly', 'annually')),

  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_reminders_property_due_idx
  on public.property_reminders (property_id, due_date);

create trigger property_reminders_set_updated_at
  before update on public.property_reminders
  for each row execute function public.set_updated_at();

-- ============================================================================
-- RLS — members only, guests excluded outright (including reads).
--
-- This is deliberately STRICTER than property_contacts, which a granted guest
-- can read. A contact is "who to call about the boiler" — useful to someone
-- staying. A reminder is "insurance premium due the 15th, $2,400, policy
-- 88-42213": the financial operating detail of the family's property, which a
-- guest has no business seeing. It matches how PRD 32 already treats the source
-- documents themselves (private bucket, guests refused at the action).
-- ============================================================================
alter table public.property_reminders enable row level security;

create policy "property_reminders: member read"
  on public.property_reminders for select
  to authenticated
  using (not public.is_guest());

create policy "property_reminders: member insert"
  on public.property_reminders for insert
  to authenticated
  with check (not public.is_guest());

create policy "property_reminders: member update"
  on public.property_reminders for update
  to authenticated
  using (not public.is_guest())
  with check (not public.is_guest());

create policy "property_reminders: member delete"
  on public.property_reminders for delete
  to authenticated
  using (not public.is_guest());

-- ============================================================================
-- Calendar feed: reminders for a token-authorized poller.
--
-- Mirrors ics_bookings_for_token (PRD 25) exactly, including the two checks that
-- function had to be retrofitted with after the guest-exfiltration finding:
--
--   * deactivation lockout for every role, so a departed member's leaked feed
--     URL stops working;
--   * guests get NOTHING here at any scope. The bookings feed collapses a guest
--     to their own rows; there is no equivalent "own reminder", and the RLS above
--     already says guests can't see reminders at all, so the feed must not
--     become the way around that.
--
-- Runs with NO JWT (cookieless pollers via the anon role), so auth.uid() is null
-- and is_guest() can't be used — the role is read from the token-resolved
-- profile row, same as the bookings function.
-- ============================================================================
set search_path = public, extensions;

create or replace function public.ics_reminders_for_token(
  p_token uuid,
  p_scope text
)
returns table (
  id uuid,
  title text,
  notes text,
  due_date date,
  recurrence text,
  property_name text,
  property_slug text,
  property_location text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
  v_role text;
  v_deactivated boolean;
begin
  select pr.id, pr.role, (pr.deactivated_at is not null)
    into v_member, v_role, v_deactivated
  from public.profiles pr
  where pr.ics_token = p_token;

  if v_member is null then
    raise exception 'invalid ics token'
      using errcode = '28000';  -- invalid_authorization_specification
  end if;

  if v_deactivated then
    raise exception 'ics token belongs to a deactivated member'
      using errcode = '28000';
  end if;

  -- Guests see no reminders at any scope. Returning here (rather than filtering)
  -- makes that unconditional and impossible to weaken by editing the where
  -- clause below.
  if v_role = 'guest' then
    return;
  end if;

  return query
    select
      r.id,
      r.title,
      r.notes,
      r.due_date,
      r.recurrence,
      p.name,
      p.slug,
      p.location
    from public.property_reminders r
    join public.properties p on p.id = r.property_id
    where
      -- 'me' is a personal *booking* feed; reminders belong to a property, not
      -- to a person, so that scope carries none. 'all' and a property slug do.
      (p_scope = 'all')
      or (p_scope not in ('me', 'all') and p.slug = p_scope)
    order by r.due_date;
end;
$$;

revoke all on function public.ics_reminders_for_token(uuid, text) from public;
grant execute on function public.ics_reminders_for_token(uuid, text)
  to anon, authenticated;
