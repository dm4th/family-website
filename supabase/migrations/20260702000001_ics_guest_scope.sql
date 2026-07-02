-- Family Trust Portal — Calendar-feed guest scoping + deactivation lockout (PRD 25)
--
-- SECURITY FIX (HIGH). ics_bookings_for_token() was written before guest access
-- (PRD 15) existed and authorized purely on the token being valid — it never
-- looked at the resolved member's role or deactivation. Because every profile
-- (including every guest) gets an ics_token by default AND a guest can read
-- their own profile row, a signed-in guest could:
--
--   1. select ics_token from profiles where id = auth.uid()   (allowed by RLS)
--   2. GET /api/ics/all?token=<that token>
--
-- ...and receive EVERY approved booking across ALL properties, including every
-- booker's full_name and email — bypassing the whole guest-scoping model
-- (in-app a guest sees only their own bookings, and property_busy_ranges() was
-- purpose-built to redact identities). The /api/ics/ path is also exempt from
-- the proxy auth gate, so nothing upstream catches it.
--
-- This migration re-creates the function with two checks the original lacked:
--
--   * Deactivation (ALL roles): if the resolved member's deactivated_at is set,
--     raise 28000 so a departed person's leaked feed URL dies. The route already
--     maps 28000 → 401. (Complements PRD 26, which also rotates the token; safe
--     to land here independently — the function is the authoritative gate.)
--
--   * Guest scoping: a guest token collapses to the guest's OWN bookings at ANY
--     p_scope ('me' / 'all' / <slug>). This is the simplest correct option the
--     PRD calls out — it mirrors the in-app guest model exactly (a guest sees
--     only their own bookings) and makes it structurally impossible to return
--     another booker's guest_name/guest_email to a guest under any scope. A
--     guest's calendar app still works; it just shows only their own rows
--     (none, in v1 — guests don't book yet).
--
-- Member/admin path is byte-for-byte unchanged: they legitimately see every
-- booking today.
--
-- NOTE: this function runs with NO JWT (cookieless pollers via the anon role),
-- so auth.uid() is null here — we CANNOT reuse is_guest()/is_property_guest(),
-- which resolve the caller from the session. Role and deactivation are read
-- directly from the token-resolved profile row instead.

set search_path = public, extensions;

create or replace function public.ics_bookings_for_token(
  p_token uuid,
  p_scope text
)
returns table (
  id uuid,
  start_date date,
  end_date date,
  notes text,
  guest_count integer,
  property_name text,
  property_slug text,
  property_location text,
  guest_name text,
  guest_email text
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

  -- Deactivation lockout for EVERY role: a removed person's leaked feed URL
  -- must stop working. Route maps 28000 → 401.
  if v_deactivated then
    raise exception 'ics token belongs to a deactivated member'
      using errcode = '28000';
  end if;

  return query
    select
      b.id,
      b.start_date,
      b.end_date,
      b.notes,
      b.guest_count,
      p.name,
      p.slug,
      p.location,
      rq.full_name,
      rq.email
    from public.bookings b
    join public.properties p on p.id = b.property_id
    join public.profiles rq on rq.id = b.requested_by
    where b.status = 'approved'
      and (
        -- Guest: only ever their OWN bookings, at ANY scope. Collapsing every
        -- scope to own rows means a guest can never see another member's
        -- identity (guest_name/guest_email) or a property they weren't granted.
        (v_role = 'guest' and b.requested_by = v_member)
        -- Member/admin: unchanged — full scope resolution as before.
        or (
          v_role <> 'guest'
          and (
            (p_scope = 'me' and b.requested_by = v_member)
            or (p_scope = 'all')
            or (p_scope not in ('me', 'all') and p.slug = p_scope)
          )
        )
      )
    order by b.start_date;
end;
$$;

-- Anon (Google's pollers) and authenticated callers may execute; the token
-- inside is the gate. Lock out PUBLIC first so the grant is explicit.
revoke all on function public.ics_bookings_for_token(uuid, text) from public;
grant execute on function public.ics_bookings_for_token(uuid, text)
  to anon, authenticated;
