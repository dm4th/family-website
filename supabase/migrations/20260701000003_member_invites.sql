-- Member invites (PRD 24, slice 2).
--
-- Any family member (not a guest) can invite a new member, or a guest scoped to
-- a property. Only admins can invite a new admin (privilege-escalation guard).
-- Members see and revoke the invitations they created; admins see/manage all.
--
-- Replaces the admin-only invitations policies from 20260523000002_rls.sql.
-- (The admin-only DELETE stays; revoking is an UPDATE to status='revoked', not
-- a hard delete.)

drop policy if exists "invitations: admin read"   on public.invitations;
drop policy if exists "invitations: admin insert" on public.invitations;
drop policy if exists "invitations: admin update" on public.invitations;

-- READ: admins see the whole list; a member sees only invitations they sent.
create policy "invitations: read own or admin"
  on public.invitations for select
  to authenticated
  using (public.is_admin() or invited_by = (select auth.uid()));

-- INSERT: any non-guest member, as themselves (invited_by = caller). A new
-- *admin* invite is admin-only. Guests cannot invite.
create policy "invitations: member insert own"
  on public.invitations for insert
  to authenticated
  with check (
    not public.is_guest()
    and invited_by = (select auth.uid())
    and (role <> 'admin' or public.is_admin())
  );

-- UPDATE (revoke): the inviter or an admin. The role guard is repeated in the
-- CHECK so a member can't UPDATE their own pending invite up to role='admin'
-- via a direct API call.
create policy "invitations: revoke own or admin"
  on public.invitations for update
  to authenticated
  using (public.is_admin() or invited_by = (select auth.uid()))
  with check (
    (public.is_admin() or invited_by = (select auth.uid()))
    and (role <> 'admin' or public.is_admin())
  );
