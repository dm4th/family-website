-- Feedback & Suggestions (PRD 20).
--
-- A durable, browsable channel for the whole family — members AND guests — to
-- suggest a feature ("idea"), report a rough edge ("problem"), or send any
-- other note from anywhere in the app. Email alone loses history; this table is
-- the record, and a best-effort Resend alert (app layer) surfaces new rows to
-- admins immediately.
--
--   * category  — 'idea' | 'problem' | 'other' (triage bucket)
--   * message   — the note itself (required, one or two sentences)
--   * page_url  — where they were when they hit "Send Feedback" (auto-captured)
--   * status    — 'new' | 'seen' | 'planned' | 'done' (admin triage queue)
--
-- RLS posture is DELIBERATELY DIFFERENT from the rest of the app: feedback is
-- the one write guests are allowed site-wide, so the INSERT policy does NOT
-- carry the usual `not is_guest()` gate. A guest hitting a rough edge is exactly
-- the signal Dan wants (see PRD 20). Reads are admin-all + own-row; status
-- updates are admin-only.

create table public.feedback (
  id         uuid primary key default gen_random_uuid(),
  category   text not null default 'idea'
             check (category in ('idea', 'problem', 'other')),
  message    text not null,
  page_url   text,
  status     text not null default 'new'
             check (status in ('new', 'seen', 'planned', 'done')),
  -- Points at `profiles` (not auth.users) so the admin triage view can embed
  -- the submitter's name/email in one query (same pattern as bookings). A
  -- profile's id IS its auth.uid(), so the `created_by = auth.uid()` insert
  -- check below is unaffected.
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The admin triage list is newest-first; status is the queue's working column.
create index feedback_created_at_idx on public.feedback (created_at desc);
create index feedback_status_idx on public.feedback (status);

-- ----------------------------------------------------------------------------
-- RLS — everyone submits; admins triage; submitters may re-read their own row.
-- ----------------------------------------------------------------------------
alter table public.feedback enable row level security;

-- READ: admins see the whole queue; a submitter can re-read only their own row
-- (e.g. the confirmation refetch). No cross-user visibility for non-admins.
create policy "feedback: admin or own read"
  on public.feedback for select
  to authenticated
  using (public.is_admin() or (select auth.uid()) = created_by);

-- INSERT: ANY authenticated user — members AND guests — may add their own row.
-- Note the intentional absence of a `not is_guest()` gate: feedback is the one
-- write guests are permitted site-wide (PRD 20). `created_by` must be the
-- caller, so no one can plant a row under someone else's name.
create policy "feedback: anyone inserts own"
  on public.feedback for insert
  to authenticated
  with check ((select auth.uid()) = created_by);

-- UPDATE: admin-only (advancing status through the triage queue).
create policy "feedback: admin update"
  on public.feedback for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- DELETE: admin-only (housekeeping; submitters cannot remove their own note
-- once sent — the record is the point).
create policy "feedback: admin delete"
  on public.feedback for delete
  to authenticated
  using (public.is_admin());
