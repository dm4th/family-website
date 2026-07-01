-- Invite-only access (PRD 24, slice 1).
--
-- THE HOLE: handle_new_user() defaulted any new sign-in with no matching
-- invitation to role 'member', so anyone who found the URL and entered any
-- email (or used Google) became a full family member. This closes it.
--
-- THE FIX: reject the signup when no valid pending invitation matches the email.
-- Raising inside this AFTER-INSERT trigger rolls back the auth.users insert, so
-- no auth user and no profile are created. It covers BOTH magic-link and Google
-- OAuth, since every new user passes through this one trigger.
--
-- SAFE FOR EXISTING USERS: the trigger fires only on account *creation*. Dan,
-- Peter, and the deactivated test rows already have auth.users rows, so they are
-- unaffected and keep signing in.
--
-- Everything else is byte-for-byte the current definition (20260629000002):
-- match the invited email, adopt its role, mark the invitation accepted, and
-- materialize the guest's property_guests grant from grant_property_id.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.invitations%rowtype;
  v_role text;
  v_full_name text;
  v_avatar_url text;
begin
  select *
    into v_invitation
    from public.invitations
   where lower(email) = lower(new.email)
     and status = 'pending'
     and (expires_at is null or expires_at > now())
   order by created_at desc
   limit 1;

  -- Invite-only gate (PRD 24). No valid invitation => reject the signup.
  if not found then
    raise exception 'not_invited: % is not invited', new.email
      using
        message = 'This email address has not been invited to the family site.',
        errcode = '42501'; -- insufficient_privilege
  end if;

  v_role := v_invitation.role;
  update public.invitations
     set status = 'accepted',
         accepted_at = now()
   where id = v_invitation.id;

  v_full_name :=
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    );
  v_avatar_url := new.raw_user_meta_data ->> 'avatar_url';

  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (new.id, new.email, v_full_name, v_avatar_url, v_role)
  on conflict (id) do nothing;

  -- Deferred guest grant: a guest invite carrying a property gets its read grant
  -- now that the profile exists.
  if v_invitation.role = 'guest'
     and v_invitation.grant_property_id is not null then
    insert into public.property_guests (property_id, profile_id, granted_by)
    values (v_invitation.grant_property_id, new.id, v_invitation.invited_by)
    on conflict (property_id, profile_id) do nothing;
  end if;

  return new;
end;
$$;
