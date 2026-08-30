-- Family Trust Portal — Inferred Taxonomy (PRD 40, slice 2).
--
-- Slice 1 shipped trust_categories empty on purpose: the taxonomy is inferred
-- from the uploaded corpus (AI proposes, a manager approves) rather than
-- predefined. This migration is the small DB half of that: no new tables, just
-- the two policy adjustments slice 2 needs. The vault migration
-- (20260830000001) is applied to prod and is therefore immutable — changes
-- land here instead.

set search_path = public, extensions;

-- ============================================================================
-- 1. Pin created_by on category inserts (deferred nit from the PR #52 review).
--    Slice 2 is when categories are first written, so the pin lands now:
--    same shape as trust_documents pinning uploaded_by.
-- ============================================================================
drop policy "trust_categories: manager write" on public.trust_categories;

create policy "trust_categories: manager write"
  on public.trust_categories for insert
  to authenticated
  with check (
    public.is_trust_manager()
    and created_by = (select auth.uid())
  );

-- ============================================================================
-- 2. New audit event kind: applying an approved taxonomy is one consequential,
--    manager-only act, logged as a single summary row (category and
--    assignment counts in `detail`) rather than one row per document.
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
    'taxonomy_applied'
  ));

-- The insert policy pins event kinds to the writer's standing (the PR #52
-- security fix); the manager list grows the new kind. Recreated wholesale so
-- the policy text stays readable in one place.
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
          'document_deleted', 'taxonomy_applied'
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
