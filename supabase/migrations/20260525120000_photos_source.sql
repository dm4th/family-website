-- Family Trust Portal — photos.source + google_media_id
--
-- Records how a photo arrived in the portal:
--   'upload'        — user picked a file from their device (default; original
--                     bytes stored in the photos bucket).
--   'google_photos' — user picked from Google Photos via the Picker API. We
--                     downloaded a downsized (~2048px) copy at pick time and
--                     stored that in the photos bucket. google_media_id holds
--                     the Picker session's mediaItem id for provenance only —
--                     Picker mediaItems are session-scoped and not re-fetchable.

alter table public.photos
  add column source text not null default 'upload'
    check (source in ('upload', 'google_photos'));

alter table public.photos
  add column google_media_id text;

create index photos_source_idx
  on public.photos (source);
