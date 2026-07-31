-- Intake retention (PRD 33) — let site admins tidy the intake bucket.
--
-- PRD 32 shipped the `intake` bucket with delete kept to the uploader, and the
-- `intake_documents` provenance rows already deletable by "uploader or admin".
-- That mismatch is the whole reason this migration exists: an admin could remove
-- the row that says a document was read, and *not* the document itself, which is
-- exactly backwards for a bucket holding utility bills, insurance statements,
-- and tax notices.
--
-- It also matters operationally. Supabase's `storage.protect_delete()` trigger
-- refuses SQL deletes on `storage.objects`, so the only way to remove an object
-- is the Storage API, which in practice means the app. Cleaning up after another
-- member with the uploader-only policy meant a hand-built API call with a
-- service-role key. Nobody should need that to tidy a stray photo.
--
-- Aligning the two policies means one authorization rule for a document and its
-- record: the person who uploaded it, or a site admin.

drop policy if exists "intake bucket: owner delete" on storage.objects;

create policy "intake bucket: owner or admin delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'intake'
    and ((select auth.uid()) = owner or is_admin())
  );
