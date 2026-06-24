-- Family Trust Portal — calendar subscription tokens
--
-- Makes the ICS feed a real, auto-updating calendar subscription instead of a
-- one-time cookie-authed download. Google/Apple/Outlook poll the feed from
-- their own servers with NO session cookie, so the feed needs a different
-- authorization channel: a per-member secret token in the query string.
--
--   * profiles.ics_token — a rotatable bearer secret (uuid). Anyone holding a
--     member's feed URL can read that scope's approved bookings (family-private;
--     consistent with the in-app model where every member can already see all
--     bookings). Rotatable via a "reset my calendar link" action.
--   * ics_bookings_for_token() — SECURITY DEFINER lookup the route calls when a
--     token is present (no cookie → the anon role can't pass bookings RLS). It
--     validates the token and returns approved bookings for the requested scope.
--     The token IS the authorization; the function never trusts a caller-passed
--     member id.

set search_path = public, extensions;

-- ============================================================================
-- profiles.ics_token — per-member calendar-feed secret.
-- Existing rows get one via the default; unique so the lookup is a point read.
-- ============================================================================
alter table public.profiles
  add column if not exists ics_token uuid not null default gen_random_uuid();

create unique index if not exists profiles_ics_token_key
  on public.profiles (ics_token);

-- ============================================================================
-- ics_bookings_for_token(token, scope) — cookieless feed reader.
--
-- scope:
--   'me'   → the token-owner's own approved bookings, every property
--   'all'  → every approved booking across all properties
--   <slug> → approved bookings for one property
--
-- Returns an empty set for scopes with no matching bookings, but raises
-- (errcode 28000) for an invalid/absent token so the route can answer 401 and
-- never leak an empty-but-valid calendar to an unauthenticated poller.
--
-- SECURITY DEFINER: runs as the owner to bypass RLS (the caller is the anon
-- role — Google's servers — with no JWT). Safe because the only authorization
-- input is the secret token, resolved to a member here; the function exposes
-- nothing a signed-in member couldn't already read in-app.
-- ============================================================================
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
begin
  select pr.id into v_member
  from public.profiles pr
  where pr.ics_token = p_token;

  if v_member is null then
    raise exception 'invalid ics token'
      using errcode = '28000';  -- invalid_authorization_specification
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
        (p_scope = 'me' and b.requested_by = v_member)
        or (p_scope = 'all')
        or (p_scope not in ('me', 'all') and p.slug = p_scope)
      )
    order by b.start_date;
end;
$$;

-- Anon (Google's pollers) and authenticated callers may execute; the token
-- inside is the gate. Lock out PUBLIC first so the grant is explicit.
revoke all on function public.ics_bookings_for_token(uuid, text) from public;
grant execute on function public.ics_bookings_for_token(uuid, text)
  to anon, authenticated;
