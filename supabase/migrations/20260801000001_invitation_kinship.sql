-- PRD 39, slice A — "the invitation actually invites".
--
-- The inviter knows the relationship better than the invitee knows the tree, so
-- we capture it once, at invite time, as a single optional question ("Who are
-- they to you?"). The welcome flow's tree step later reads it to order the
-- parent/spouse pickers with likely matches first — a hint, never an edge.
--
-- Deliberately NOT a foreign key to `people`: the inviter answers about
-- themselves ("they're my child"), and resolving that to person rows is the
-- invitee's job during onboarding, where the confirm-before-claim rule applies.
-- Nothing here writes to the tree.

alter table public.invitations
  add column if not exists relation_to_inviter text,
  add column if not exists relation_note text;

alter table public.invitations
  drop constraint if exists invitations_relation_to_inviter_check;

alter table public.invitations
  add constraint invitations_relation_to_inviter_check
  check (
    relation_to_inviter is null
    or relation_to_inviter in ('parent', 'child', 'sibling', 'spouse', 'other')
  );

comment on column public.invitations.relation_to_inviter is
  'Optional kinship of the invitee TO the inviter, from the inviter''s point of view (invitee is the inviter''s parent/child/sibling/spouse/other). A hint that orders the onboarding tree pickers; never creates a relationships row. Always null for guest invites.';

comment on column public.invitations.relation_note is
  'Optional free-text qualifier the inviter adds alongside relation_to_inviter (e.g. "my stepdaughter"). Display only.';

-- ---------------------------------------------------------------------------
-- Reading your own invitation's hint.
--
-- `invitations` RLS deliberately lets a member read only the invitations THEY
-- sent, so the invitee cannot select their own row — which is exactly the row
-- the welcome flow needs to order its pickers. Rather than widen that policy
-- (which would expose the whole invite list keyed by email), this SECURITY
-- DEFINER function returns just two facts about the caller's own invitation:
-- the kinship the inviter recorded, and which person in the tree the inviter
-- is. Both are things the caller is about to be shown anyway; `people` is
-- readable by every member.
--
-- Matched on the caller's own auth.users email, never on a parameter, so it
-- cannot be pointed at anyone else's invitation.
-- ---------------------------------------------------------------------------
create or replace function public.my_invitation_hint()
returns table (
  relation_to_inviter text,
  relation_note text,
  inviter_person_id uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.relation_to_inviter,
         i.relation_note,
         p.id
    from public.invitations i
    join auth.users u
      on lower(u.email) = lower(i.email)
    left join public.people p
      on p.profile_id = i.invited_by
   where u.id = auth.uid()
     and i.relation_to_inviter is not null
     and i.role <> 'guest'
     -- A revoked or expired invitation shouldn't still be suggesting family.
     -- 'accepted' has to stay: the hint is read after sign-in, by which point
     -- handle_new_user() has already marked the invitation accepted.
     and i.status in ('pending', 'accepted')
   order by i.created_at desc
   limit 1;
$$;

comment on function public.my_invitation_hint is
  'PRD 39: the kinship the inviter recorded about the caller, plus the inviter''s person row. SECURITY DEFINER because invitations RLS hides the invitee''s own row from them; scoped to the caller''s own email so it cannot read anyone else''s invitation. Guest invites never carry a hint.';

revoke all on function public.my_invitation_hint() from public, anon;
grant execute on function public.my_invitation_hint() to authenticated;
