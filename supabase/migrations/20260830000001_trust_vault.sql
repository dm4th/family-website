-- Family Trust Portal — Trust Document Vault (PRD 40, slice 1).
--
-- The security foundation for the Advisory zone: a private store for the
-- family's trust documents (moving out of Dropbox) that the future PRD-07
-- adviser agent will read through, plus the access model those documents
-- demand. Everything here is deliberately STRICTER than the rest of the site:
--
--   * DEFAULT DENY, even for members. Family membership grants nothing.
--     Reading a document requires an explicit per-(document, person) grant in
--     trust_document_access — this is how the trust's outside adviser and
--     accountant (guest-role accounts) will see exactly the documents meant
--     for them, and how a family member without a grant sees none. No policy
--     in this file uses `not is_guest()`: role never decides trust access.
--
--   * A NAMED MANAGER SET, not is_admin(). Site admin means "runs the
--     website"; trust manager means "stewards the trust" (decided 2026-08-30:
--     Dad + Dan). Managers upload, grant, and delete. Site admins administer
--     the manager ROSTER (the bootstrap has to live somewhere, and roster
--     changes are audited) but do not inherit document access.
--
--   * AN APPEND-ONLY AUDIT LOG. trust_document_events records uploads, views,
--     grant changes, deletions, and roster changes. It has insert and select
--     policies only — no UPDATE or DELETE policy exists for any role, so at
--     the SQL level the log can only grow.
--
--   * NO SERVICE-ROLE KEY, ever. The app (and later the agent) reads as the
--     signed-in user through these policies; nothing here creates a path that
--     bypasses them.
--
-- Object names in the bucket are UUIDs; real document names live only on the
-- trust_documents row. That keeps storage listings meaningless on their own
-- and leaves the door open to app-layer envelope encryption later (deferred
-- 2026-08-30) without re-uploading.

set search_path = public, extensions;

-- ============================================================================
-- 1. trust_managers + is_trust_manager()
--
-- Roster writes are is_admin(): somebody has to be able to seat the first
-- manager, and the admin-guarded path is the established bootstrap posture
-- (cf. revoke_user_sessions). The seat itself is what carries power — an
-- admin who quietly adds themself still leaves a manager_added audit row.
-- ============================================================================
create table if not exists public.trust_managers (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.trust_managers enable row level security;

-- Same posture as is_admin()/is_active(): security definer so it can read the
-- roster past RLS from inside other tables' policies, stable so auth.uid() is
-- evaluated once per statement, empty search_path so every name is qualified.
create or replace function public.is_trust_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.trust_managers
     where profile_id = (select auth.uid())
  );
$$;

revoke all on function public.is_trust_manager() from public;
grant execute on function public.is_trust_manager() to authenticated;

create policy "trust_managers: manager or admin read"
  on public.trust_managers for select
  to authenticated
  using (public.is_trust_manager() or public.is_admin());

create policy "trust_managers: admin insert"
  on public.trust_managers for insert
  to authenticated
  with check (public.is_admin());

create policy "trust_managers: admin delete"
  on public.trust_managers for delete
  to authenticated
  using (public.is_admin());

create policy "trust_managers: active only"
  on public.trust_managers as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

-- ============================================================================
-- 2. trust_categories — the inferred taxonomy (PRD 40 decision, 2026-08-30).
--
-- Deliberately data, never an enum: documents upload uncategorized, and a
-- later AI pass PROPOSES categories a manager approves (slice 2). A different
-- family's corpus on this same schema produces a different taxonomy.
-- ============================================================================
create table if not exists public.trust_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  position integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.trust_categories enable row level security;

-- ============================================================================
-- 3. trust_documents — one row per stored document or notebook scan.
--
-- uploaded_by is SET NULL on profile deletion, not CASCADE: a departed
-- uploader must never take the trust's documents with them (contrast
-- intake_documents, where cascading provenance is fine).
-- ============================================================================
create table if not exists public.trust_documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- 'document' = a digital original (PDF etc.); 'scan' = a photographed
  -- notebook page awaiting slice 3's OCR + review.
  kind text not null check (kind in ('document', 'scan')),
  category_id uuid references public.trust_categories(id) on delete set null,
  storage_path text not null unique,
  content_type text not null,
  byte_size integer not null,
  version integer not null default 1,
  replaces_id uuid references public.trust_documents(id) on delete set null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists trust_documents_category_idx
  on public.trust_documents (category_id, created_at desc);
create index if not exists trust_documents_kind_idx
  on public.trust_documents (kind, created_at desc);

alter table public.trust_documents enable row level security;

-- (Policies for trust_documents are created below, after trust_document_access
-- exists — the read policy's grant lookup references it.)

-- ============================================================================
-- 4. trust_document_access — the explicit per-(document, person) grant.
-- ============================================================================
create table if not exists public.trust_document_access (
  document_id uuid not null references public.trust_documents(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (document_id, profile_id)
);

-- Backs both the RLS grant lookups and "what can this person see" queries.
create index if not exists trust_document_access_profile_idx
  on public.trust_document_access (profile_id);

alter table public.trust_document_access enable row level security;

-- Managers see every grant; everyone else sees only their own (that's what
-- lets a grantee's document list render, and nothing more).
create policy "trust_document_access: manager or own read"
  on public.trust_document_access for select
  to authenticated
  using (
    public.is_trust_manager()
    or profile_id = (select auth.uid())
  );

create policy "trust_document_access: manager insert"
  on public.trust_document_access for insert
  to authenticated
  with check (
    public.is_trust_manager()
    and granted_by = (select auth.uid())
  );

create policy "trust_document_access: manager delete"
  on public.trust_document_access for delete
  to authenticated
  using (public.is_trust_manager());

create policy "trust_document_access: active only"
  on public.trust_document_access as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

-- ---------------------------------------------------------------------------
-- trust_documents policies, now that trust_document_access exists.
-- The read predicate here is THE access rule of the vault: manager, or
-- explicit grant. Page text and stored bytes read under the same rule.
-- ---------------------------------------------------------------------------
create policy "trust_documents: manager or granted read"
  on public.trust_documents for select
  to authenticated
  using (
    public.is_trust_manager()
    or exists (
      select 1
        from public.trust_document_access a
       where a.document_id = trust_documents.id
         and a.profile_id = (select auth.uid())
    )
  );

create policy "trust_documents: manager insert"
  on public.trust_documents for insert
  to authenticated
  with check (
    public.is_trust_manager()
    and uploaded_by = (select auth.uid())
  );

create policy "trust_documents: manager update"
  on public.trust_documents for update
  to authenticated
  using (public.is_trust_manager())
  with check (public.is_trust_manager());

create policy "trust_documents: manager delete"
  on public.trust_documents for delete
  to authenticated
  using (public.is_trust_manager());

create policy "trust_documents: active only"
  on public.trust_documents as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

-- ---------------------------------------------------------------------------
-- trust_categories policies, defined after trust_document_access exists so
-- the grant lookup can reference it: the taxonomy is visible to managers and
-- to anyone holding at least one document grant (their list groups by it),
-- and to nobody else — category names alone can describe the trust's shape.
-- ---------------------------------------------------------------------------
create policy "trust_categories: manager or granted read"
  on public.trust_categories for select
  to authenticated
  using (
    public.is_trust_manager()
    or exists (
      select 1
        from public.trust_document_access a
       where a.profile_id = (select auth.uid())
    )
  );

create policy "trust_categories: manager write"
  on public.trust_categories for insert
  to authenticated
  with check (public.is_trust_manager());

create policy "trust_categories: manager update"
  on public.trust_categories for update
  to authenticated
  using (public.is_trust_manager())
  with check (public.is_trust_manager());

create policy "trust_categories: manager delete"
  on public.trust_categories for delete
  to authenticated
  using (public.is_trust_manager());

create policy "trust_categories: active only"
  on public.trust_categories as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

-- ============================================================================
-- 5. trust_document_pages — page-level plain text, extracted at upload.
--
-- This IS document content, so it reads under exactly the document's own
-- predicate. Slice 2's taxonomy pass and slice 3's mapping proposals consume
-- it; PRD 07 adds embeddings over it later.
-- ============================================================================
create table if not exists public.trust_document_pages (
  document_id uuid not null references public.trust_documents(id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  text text not null,
  primary key (document_id, page_number)
);

alter table public.trust_document_pages enable row level security;

create policy "trust_document_pages: manager or granted read"
  on public.trust_document_pages for select
  to authenticated
  using (
    public.is_trust_manager()
    or exists (
      select 1
        from public.trust_document_access a
       where a.document_id = trust_document_pages.document_id
         and a.profile_id = (select auth.uid())
    )
  );

create policy "trust_document_pages: manager insert"
  on public.trust_document_pages for insert
  to authenticated
  with check (public.is_trust_manager());

create policy "trust_document_pages: manager delete"
  on public.trust_document_pages for delete
  to authenticated
  using (public.is_trust_manager());

create policy "trust_document_pages: active only"
  on public.trust_document_pages as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

-- ============================================================================
-- 6. trust_document_events — the append-only audit log.
--
-- Insert: any active person with standing in the vault (manager, admin
-- touching the roster, or a grantee opening a document), and only as
-- themself. Select: managers. Update/delete: NO POLICY EXISTS — the log
-- only grows.
--
-- actor_id and document_id are SET NULL on deletion so the log outlives what
-- it describes; `detail` carries the human-readable residue (document name,
-- grantee name) for exactly that case.
-- ============================================================================
create table if not exists public.trust_document_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.trust_documents(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  event text not null check (event in (
    'uploaded',
    'viewed',
    'grant_added',
    'grant_revoked',
    'document_deleted',
    'manager_added',
    'manager_removed'
  )),
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists trust_document_events_document_idx
  on public.trust_document_events (document_id, created_at desc);
create index if not exists trust_document_events_created_idx
  on public.trust_document_events (created_at desc);

alter table public.trust_document_events enable row level security;

create policy "trust_document_events: involved insert as self"
  on public.trust_document_events for insert
  to authenticated
  with check (
    actor_id = (select auth.uid())
    and (
      public.is_trust_manager()
      or public.is_admin()
      or exists (
        select 1
          from public.trust_document_access a
         where a.profile_id = (select auth.uid())
      )
    )
  );

create policy "trust_document_events: manager read"
  on public.trust_document_events for select
  to authenticated
  using (public.is_trust_manager());

create policy "trust_document_events: active only"
  on public.trust_document_events as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

-- ============================================================================
-- 7. Storage: the private `trust` bucket.
--
-- Reads require manager standing or a grant on the document whose row names
-- this object — checked through a definer function because storage policies
-- can't join public tables directly under the caller's RLS without cost.
-- An object with no trust_documents row yet (mid-upload) is readable only by
-- managers, which is exactly who is uploading it.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('trust', 'trust', false)
on conflict (id) do nothing;

create or replace function public.can_read_trust_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.trust_documents d
      join public.trust_document_access a on a.document_id = d.id
     where d.storage_path = p_name
       and a.profile_id = (select auth.uid())
  );
$$;

revoke all on function public.can_read_trust_object(text) from public;
grant execute on function public.can_read_trust_object(text) to authenticated;

create policy "trust bucket: manager insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'trust'
    and (select auth.uid()) = owner
    and public.is_trust_manager()
  );

create policy "trust bucket: manager or granted read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'trust'
    and (public.is_trust_manager() or public.can_read_trust_object(name))
  );

create policy "trust bucket: manager delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'trust' and public.is_trust_manager());

-- Same shape as "photos bucket: active only" (PRD 26): a no-op for every
-- other bucket, an AND-ed activation requirement for this one.
create policy "trust bucket: active only"
  on storage.objects
  as restrictive for all to authenticated
  using (bucket_id <> 'trust' or public.is_active())
  with check (bucket_id <> 'trust' or public.is_active());
