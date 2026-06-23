-- Family Trust Portal — defense-in-depth dedup for Google-Photos-picker rows.
--
-- Adds a partial unique index on (uploaded_by, google_media_id) for rows
-- where google_media_id is not null.
--
-- IMPORTANT — what this does and does not protect against:
--
-- The Google Photos Picker API issues mediaItem.id values that are
-- session-scoped: the same physical photo, picked in two different picker
-- sessions, gets two distinct ids. So this index does NOT dedup the
-- "user picked the same photo twice across two trips through the modal"
-- case — that requires a content-hash (deferred; see admin storage
-- dashboard milestone) or interactive client-side dedup before insert.
--
-- What it DOES catch: degenerate races where the client retries a single
-- session's import after a partial network failure and a row from the
-- first attempt lands at the same moment as a row from the retry. Cheap
-- insurance; no production data shape is affected.

create unique index photos_google_media_id_uploader_unique
  on public.photos (uploaded_by, google_media_id)
  where google_media_id is not null;
