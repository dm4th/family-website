-- Smart Intake (PRD 32, slice 1) — private source-document store.
--
-- A member photographs a bill, we read it with a vision model, and pre-fill the
-- existing contact / property forms. The uploaded document is the *source* for
-- that pre-fill: it routinely contains account numbers, policy numbers and
-- service addresses, so it is treated as sensitive — private bucket, signed-URL
-- access only, never readable by guests.
--
-- Nothing here is a write path for extracted data. Saving still goes through
-- addPropertyContact / updateProperty exactly as before (PRD 27 posture).

-- ============================================================================
-- Bucket: private, no public discovery.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('intake', 'intake', false)
on conflict (id) do nothing;

-- Members (not guests) may upload; storage records the uploader as `owner`.
create policy "intake bucket: member insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'intake'
    and (select auth.uid()) = owner
    and not is_guest()
  );

-- Members (not guests) may read. Combined with a private bucket this means
-- signed URLs only; guests are excluded outright because bills carry account
-- numbers that a granted guest has no business seeing.
create policy "intake bucket: member read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'intake' and not is_guest());

-- Cleanup stays with the uploader.
create policy "intake bucket: owner delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'intake' and (select auth.uid()) = owner);

-- ============================================================================
-- Index table: which document was read, for which property, by whom.
--
-- This is provenance, not content — it lets a member re-open the original when
-- a pre-filled field looked off. It is written when an extraction runs, whether
-- or not the member goes on to save anything.
-- ============================================================================
create table if not exists public.intake_documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  storage_path text not null unique,
  content_type text not null,
  byte_size integer not null,
  -- Which extraction schema was applied ("contact" today; "note" / "calendar"
  -- arrive with slices 2 and 3).
  intent text not null,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists intake_documents_property_idx
  on public.intake_documents (property_id, created_at desc);

alter table public.intake_documents enable row level security;

-- Any signed-in member (never a guest) can see what has been read for a
-- property they can already read; the row carries no extracted content.
create policy "intake documents: member read"
  on public.intake_documents for select
  to authenticated
  using (not is_guest());

create policy "intake documents: member insert"
  on public.intake_documents for insert
  to authenticated
  with check (not is_guest() and (select auth.uid()) = uploaded_by);

create policy "intake documents: owner delete"
  on public.intake_documents for delete
  to authenticated
  using ((select auth.uid()) = uploaded_by or is_admin());
