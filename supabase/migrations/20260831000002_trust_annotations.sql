-- Family Trust Portal — Notebook Intake (PRD 40, slice 3).
--
-- The approve/deny layer for Dad's handwritten notebook. A scan (already a
-- trust_documents row, kind 'scan') is read by the OCR pass: its transcription
-- lands in trust_document_pages, and every extracted key point becomes a
-- PENDING trust_annotations row, optionally carrying a proposed mapping to a
-- page of a digital document. A trust manager then approves (after editing),
-- or denies, each one.
--
-- THE CORPUS RULE (load-bearing for PRD 07): the future adviser agent's
-- trusted corpus is `trust_document_pages` of kind='document' documents plus
-- APPROVED trust_annotations — never raw scan OCR. Scan transcriptions in the
-- pages table exist for the review screen and provenance; anything that
-- consumes pages for reasoning must filter by the parent document's kind
-- (the slice-2 taxonomy pass already does).
--
-- Denied rows are kept, not deleted: a re-read of the same scan must not
-- re-propose what a manager already rejected.

set search_path = public, extensions;

-- ============================================================================
-- 1. trust_annotations
-- ============================================================================
create table if not exists public.trust_annotations (
  id uuid primary key default gen_random_uuid(),
  -- The notebook page this came from. CASCADE: deleting a scan deletes its
  -- extracted points (the audit log's document_deleted row is the residue).
  scan_document_id uuid not null references public.trust_documents(id) on delete cascade,
  -- Which page of the scan (scanned PDFs can be multi-page; photos are 1).
  scan_page integer not null default 1 check (scan_page >= 1),
  -- The key point itself. Manager-editable while pending.
  text text not null,
  -- Verbatim words from the transcription this point rests on, so the review
  -- screen can show receipts. Null when the model gave none.
  source_quote text,
  -- The model's stated confidence in the point, for review triage.
  confidence text check (confidence in ('high', 'medium', 'low')),
  -- Proposed (then approved) link back to a digital document. SET NULL:
  -- deleting the mapped document orphans the link, never the point.
  mapped_document_id uuid references public.trust_documents(id) on delete set null,
  mapped_page integer check (mapped_page >= 1),
  mapping_note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists trust_annotations_scan_idx
  on public.trust_annotations (scan_document_id, status, created_at);
create index if not exists trust_annotations_status_idx
  on public.trust_annotations (status, created_at desc);

alter table public.trust_annotations enable row level security;

-- Manager-only, all four verbs: extraction, review, and approval are manager
-- work. Whether approved annotations surface to grant holders is PRD 07's
-- decision to make at the reading layer — nothing here grants it early.
create policy "trust_annotations: manager read"
  on public.trust_annotations for select
  to authenticated
  using (public.is_trust_manager());

create policy "trust_annotations: manager insert"
  on public.trust_annotations for insert
  to authenticated
  with check (
    public.is_trust_manager()
    and created_by = (select auth.uid())
  );

create policy "trust_annotations: manager update"
  on public.trust_annotations for update
  to authenticated
  using (public.is_trust_manager())
  with check (public.is_trust_manager());

create policy "trust_annotations: manager delete"
  on public.trust_annotations for delete
  to authenticated
  using (public.is_trust_manager());

create policy "trust_annotations: active only"
  on public.trust_annotations as restrictive for all to authenticated
  using (public.is_active()) with check (public.is_active());

-- ============================================================================
-- 2. trust_document_pages: managers may now UPDATE (a re-read of a scan
--    replaces its transcription via upsert; slice 1 shipped insert/delete
--    only, which made upserts fail on the conflict path).
-- ============================================================================
create policy "trust_document_pages: manager update"
  on public.trust_document_pages for update
  to authenticated
  using (public.is_trust_manager())
  with check (public.is_trust_manager());

-- ============================================================================
-- 3. Audit event kinds for the notebook flow: reading a scan, and each
--    per-point verdict. Constraint + the manager list of the (PR #52-
--    hardened) insert policy, recreated wholesale as in slice 2.
-- ============================================================================
alter table public.trust_document_events
  drop constraint trust_document_events_event_check;

alter table public.trust_document_events
  add constraint trust_document_events_event_check check (event in (
    'uploaded',
    'viewed',
    'grant_added',
    'grant_revoked',
    'document_deleted',
    'manager_added',
    'manager_removed',
    'taxonomy_applied',
    'scan_read',
    'annotation_approved',
    'annotation_denied'
  ));

drop policy "trust_document_events: involved insert as self"
  on public.trust_document_events;

create policy "trust_document_events: involved insert as self"
  on public.trust_document_events for insert
  to authenticated
  with check (
    actor_id = (select auth.uid())
    and (
      (
        public.is_trust_manager()
        and event in (
          'uploaded', 'viewed', 'grant_added', 'grant_revoked',
          'document_deleted', 'taxonomy_applied',
          'scan_read', 'annotation_approved', 'annotation_denied'
        )
      )
      or (
        (public.is_trust_manager() or public.is_admin())
        and event in ('manager_added', 'manager_removed')
      )
      or (
        event = 'viewed'
        and document_id is not null
        and exists (
          select 1
            from public.trust_document_access a
           where a.document_id = trust_document_events.document_id
             and a.profile_id = (select auth.uid())
        )
      )
    )
  );
