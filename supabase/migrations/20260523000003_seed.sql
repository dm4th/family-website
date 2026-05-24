-- Family Trust Portal — initial seed data
-- Idempotent: safe to re-run.

-- ============================================================================
-- Seed properties: Loon Lake + Loon Cabin
-- ============================================================================
insert into public.properties (slug, name, location, description, how_to, guidelines)
values
  (
    'loon-lake',
    'Loon Lake',
    'Loon Lake — main house',
    'The main place on the lake. Update this description with whatever the family wants people to know.',
    e'## How things work here\n\n- Trash day: TBD\n- WiFi: TBD\n- Boat / dock: TBD\n\nEdit this section as a family — every change is logged.',
    e'## House rules\n\n- TBD\n\nEdit as a family.'
  ),
  (
    'loon-cabin',
    'Loon Cabin',
    'Loon Lake — cabin',
    'The cabin at Loon Lake. Update this description with whatever the family wants people to know.',
    e'## How things work here\n\n- TBD\n\nEdit as a family.',
    e'## House rules\n\n- TBD\n\nEdit as a family.'
  )
on conflict (slug) do nothing;

-- ============================================================================
-- Admin invitations — Danny + Dad.
-- handle_new_user reads these on next sign-in to assign role='admin'.
-- ============================================================================
insert into public.invitations (email, role, token, status, expires_at)
values
  (
    'danny.mathieson233@gmail.com',
    'admin',
    'seed-admin-danny',
    'pending',
    null
  ),
  (
    'pfmathieson@gmail.com',
    'admin',
    'seed-admin-dad',
    'pending',
    null
  )
on conflict do nothing;

-- ============================================================================
-- Backfill: create profiles for any auth.users that already signed in
-- before this schema existed (Danny, in particular). Same logic as
-- handle_new_user, applied retroactively.
-- ============================================================================
with existing as (
  select u.id,
         u.email,
         coalesce(
           u.raw_user_meta_data ->> 'full_name',
           u.raw_user_meta_data ->> 'name'
         ) as full_name,
         u.raw_user_meta_data ->> 'avatar_url' as avatar_url
    from auth.users u
    left join public.profiles p on p.id = u.id
   where p.id is null
),
matched as (
  select e.id,
         e.email,
         e.full_name,
         e.avatar_url,
         coalesce(i.role, 'member') as role,
         i.id as invitation_id
    from existing e
    left join lateral (
      select *
        from public.invitations
       where lower(email) = lower(e.email)
         and status = 'pending'
         and (expires_at is null or expires_at > now())
       order by created_at desc
       limit 1
    ) i on true
),
inserted as (
  insert into public.profiles (id, email, full_name, avatar_url, role)
  select id, email, full_name, avatar_url, role from matched
  returning id
)
update public.invitations
   set status = 'accepted',
       accepted_at = now()
 where id in (
   select invitation_id from matched where invitation_id is not null
 );
