-- Family Trust Portal — initial schema
-- See prds/00-master-plan.md and prds/03-properties.md for the data model.

set search_path = public, extensions;

-- ============================================================================
-- Helper: keep updated_at in sync on edits.
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- profiles — extends auth.users with display info + role.
-- ============================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  role text not null default 'member'
    check (role in ('admin', 'member', 'guest')),
  family_branch text,                 -- which of the three sibling families
  generation int,                     -- 1=siblings, 2=grandkids+spouses, 3=great-grandkids
  relationship_notes text,            -- "spouse of X", "son of Y", etc.
  phone text,
  bio text,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_branch_gen_idx
  on public.profiles (family_branch, generation);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================================
-- properties — family-shared properties (Loon Lake, Loon Cabin, …).
-- ============================================================================
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  location text,
  description text,
  address text,
  hero_image_path text,
  amenities text[] not null default '{}',
  guidelines text,                    -- house rules (Markdown)
  how_to text,                        -- "how things work here" (Markdown)
  status text not null default 'active'
    check (status in ('active', 'maintenance', 'inactive')),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

-- ============================================================================
-- property_contacts — "who do I call if the water heater dies".
-- ============================================================================
create table public.property_contacts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  label text not null,                -- 'Caretaker', 'Plumber', 'Emergency'
  name text,
  phone text,
  email text,
  notes text,
  sort_order int not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index property_contacts_property_idx
  on public.property_contacts (property_id, sort_order);

create trigger property_contacts_set_updated_at
  before update on public.property_contacts
  for each row execute function public.set_updated_at();

-- ============================================================================
-- photos — uploaded by any member, attached to a property and/or to profiles
-- via photo_subjects.
-- ============================================================================
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  caption text,
  taken_at date,
  uploaded_by uuid references auth.users(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  created_at timestamptz not null default now()
);

create index photos_property_idx on public.photos (property_id, created_at desc);
create index photos_uploaded_by_idx on public.photos (uploaded_by);

-- ============================================================================
-- photo_subjects — many-to-many between photos and the profiles in them.
-- ============================================================================
create table public.photo_subjects (
  photo_id uuid not null references public.photos(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (photo_id, profile_id)
);

create index photo_subjects_profile_idx on public.photo_subjects (profile_id);

-- ============================================================================
-- revisions — lightweight audit log for wiki-style edits.
-- ============================================================================
create table public.revisions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,          -- 'property', 'profile', 'property_contact'
  entity_id uuid not null,
  changed_by uuid references auth.users(id) on delete set null,
  diff jsonb not null,                -- { before: {...}, after: {...} } per changed field
  created_at timestamptz not null default now()
);

create index revisions_entity_idx
  on public.revisions (entity_type, entity_id, created_at desc);

-- ============================================================================
-- invitations — admin-issued invitations; consumed by handle_new_user trigger.
-- ============================================================================
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null default 'member'
    check (role in ('admin', 'member', 'guest')),
  invited_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  token text not null unique,
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Only one pending invitation per email at a time.
create unique index invitations_one_pending_per_email
  on public.invitations (lower(email))
  where status = 'pending';

-- ============================================================================
-- handle_new_user: on every auth.users INSERT, create a matching profile.
-- If a pending invitation exists for the email, adopt its role and mark
-- the invitation accepted. Otherwise default to 'member'.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.invitations%rowtype;
  v_role text := 'member';
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

  if found then
    v_role := v_invitation.role;
    update public.invitations
       set status = 'accepted',
           accepted_at = now()
     where id = v_invitation.id;
  end if;

  v_full_name :=
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    );
  v_avatar_url := new.raw_user_meta_data ->> 'avatar_url';

  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (new.id, new.email, v_full_name, v_avatar_url, v_role)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
