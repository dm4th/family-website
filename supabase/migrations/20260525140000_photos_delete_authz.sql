-- Photo deletion authorization fix.
--
-- The Remove-photo UI grants deletion to uploaders, site admins, AND property
-- admins (for a property's own photos). The original RLS only allowed
-- "uploader or site admin", and the storage.objects delete policy was
-- owner-only. That mismatch produced two bugs:
--
--   1. A property admin's Remove was silently filtered by the photos RLS, so
--      the Server Action saw no error and reported a false success while the
--      photo stayed put.
--   2. A site-admin delete removed the photos row but left the storage object
--      orphaned, because the storage RLS only lets the owner (= original
--      uploader) delete the object.
--
-- This migration aligns both delete policies with the intended model. Note
-- that for every photo we create, the storage `owner` equals photos.uploaded_by
-- (the same user uploads the binary and records the row), so the storage and
-- table authorization predicates stay in lockstep.

-- ----------------------------------------------------------------------------
-- photos table: uploader, site admin, OR property admin for the photo's property.
-- ----------------------------------------------------------------------------
drop policy if exists "photos: uploader or admin delete" on public.photos;
create policy "photos: uploader, admin, or property admin delete"
  on public.photos for delete
  to authenticated
  using (
    (select auth.uid()) = uploaded_by
    or public.is_admin()
    or public.is_property_admin(property_id)
  );

-- ----------------------------------------------------------------------------
-- storage.objects (photos bucket): same model. Property-admin rights are
-- resolved by joining the object back to its photos row via the storage path,
-- so the photos row must still exist when the object is removed (the Server
-- Action deletes the object before the row for exactly this reason).
-- ----------------------------------------------------------------------------
drop policy if exists "photos bucket: owner delete" on storage.objects;
create policy "photos bucket: owner, admin, or property admin delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'photos'
    and (
      (select auth.uid()) = owner
      or public.is_admin()
      or exists (
        select 1
        from public.photos p
        where p.storage_path = storage.objects.name
          and public.is_property_admin(p.property_id)
      )
    )
  );
