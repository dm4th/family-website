-- Family Trust Portal — photos storage bucket + RLS on storage.objects.
--
-- Bucket is private (read requires signed URLs). The photos table tracks
-- ownership and entity links; this RLS just protects the raw objects.

-- Create the bucket if it doesn't exist.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- ============================================================================
-- Authenticated users can read any object in the photos bucket.
-- (We rely on signed URLs being short-lived; private = no public discovery.)
-- ============================================================================
create policy "photos bucket: authenticated read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'photos');

-- ============================================================================
-- Authenticated users can upload to the photos bucket. Storage tracks the
-- uploader as `owner` automatically.
-- ============================================================================
create policy "photos bucket: authenticated insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'photos' and (select auth.uid()) = owner);

-- ============================================================================
-- Update and delete are restricted to the uploader.
-- (Admin override is enforced at the application layer if needed — RLS here
--  matches the photos table policies in 20260523000002_rls.sql.)
-- ============================================================================
create policy "photos bucket: owner update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'photos' and (select auth.uid()) = owner)
  with check (bucket_id = 'photos' and (select auth.uid()) = owner);

create policy "photos bucket: owner delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'photos' and (select auth.uid()) = owner);
