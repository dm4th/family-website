# 05 — File Uploads, Google Photos Picker & Storage Strategy

**Phase**: 1.5 (post-first-slice polish) · **Depends on**: 02, 03 (photo upload component already exists)
**Status**: 🚧 partial — direct-to-Supabase upload shipped 2026-05-24; Google Photos Picker code complete on `feat/google-photos-picker` 2026-05-25 (pending GCP pre-flight + smoke test); Drive Picker / family-files page / admin storage dashboard not yet built.

## Goal

Two related concerns:

1. **Bypass server-function size limits** so the family can upload real-size photos straight from their phones. (Original chunk 4 upload broke in production with `FUNCTION_PAYLOAD_TOO_LARGE` because files were passing through a Vercel Function — fixed 2026-05-24.)
2. **Avoid blowing through the Supabase storage quota** as the family fills the portal with photos. Free tier = 1GB; Pro tier = 100GB. With high-res phone photos (5–10MB each), even a modest collection adds up fast. Google Photos integration lets people *reference* their existing library instead of duplicating everything in Supabase.
3. Extend the existing photo upload to handle a few non-photo file types (PDF, common docs) for general family stuff — recipes, scanned cards, kids' drawings.

> **Hard stop**: this is *not* for trust / legal / financial documents. Those wait for Phase 3 and the security decision. The UI should explicitly say so.

## User stories

- As a member on iPhone, I drop a 15MB photo into a property gallery and it uploads without errors.
- As a Gmail-using member on iPhone, I tap "Add from Google Photos" and pick five photos from this weekend; they appear in the property gallery without me having to download then re-upload.
- As a member, I upload Grandma's secret-recipe PDF to the family files area; everyone can download it.
- As Danny (admin), I can see at a glance how much Supabase storage we're using, and how that's split between native uploads vs. Google-Photos-referenced.

## In scope (next pass)

- **Google Photos Picker integration** — the new Picker API (https://developers.google.com/photos/picker/guides/get-started), not the full Library OAuth. Picker requires only the per-pick consent, no library-wide permission.
- **Storage strategy decision**: when a user picks from Google Photos, do we
  - (a) copy the bytes into Supabase (we own canonical copy; uses our quota), or
  - (b) reference the Google URL (no quota usage, but breaks if the user deletes the photo on Google's side)
  - or (c) hybrid: store a low-res thumbnail in Supabase for fast list rendering + reference the Google URL for the full-size view
- Google Drive Picker integration for PDFs / general family files
- Generic file upload to Supabase Storage with type categorization (separate from photo upload)
- A small "Family files" index page listing general (non-property, non-profile) files
- Admin storage-usage dashboard: bytes used per bucket, top contributors, suggestion to migrate large files to Google Photos reference

## Out of scope

- Trust / legal / financial doc uploads (Phase 3)
- Folder hierarchies
- File versioning beyond Supabase Storage's built-in
- Sharing files externally

## Open questions

- **Storage strategy** (above) — needs a real decision before building the Picker. Lean toward (c) hybrid: thumbnail in Supabase for the gallery view (fast, cached, signed URLs), reference link for full-res. If Google-side photo gets deleted we still have the thumbnail.
- **Picker UX**: separate "Add from Google" button next to "Upload", or one unified "Add files" modal with tabs? Recommendation: unified modal that defaults to whichever source the user last used.
- **Mobile**: Picker SDK works in browser on mobile but the flow on iOS is clunky. Test before committing.
- **Malware scanning**: defer — small private audience, low risk; revisit if scope grows.

## Implementation (Google Photos Picker — 2026-05-25)

**Status of this milestone**: code complete on `feat/google-photos-picker`. Pending pre-flight (GCP project + OAuth client ID) before manual smoke test in dev / promotion to prod.

**Storage strategy chosen**: download from `baseUrl` at `=w2048-h2048` and store the single downsized copy in Supabase under the `google/<2hex>/<uuid>.<ext>` prefix. We record `photos.source = 'google_photos'` + `photos.google_media_id` for provenance and the admin storage tally. We do **not** attempt to re-fetch by `google_media_id` later — Picker mediaItems are session-scoped on Google's side and the broader Library API + scope is explicitly out of scope for this PRD.

**UX**: replaced the inline `<PhotoUpload>` on property and profile pages with a sheet-modal (`<AddPhotosModal>`) containing two tabs — *From device* (the existing `PhotoUpload` unchanged) and *Google Photos* (the new `GooglePhotosPicker`). Last-used tab persists in `localStorage` (`addPhotos.lastTab`).

**Key files**
- [supabase/migrations/20260525000001_photos_source.sql](../supabase/migrations/20260525000001_photos_source.sql) — adds `photos.source` (check-constrained), `photos.google_media_id`, and `photos_source_idx`. RLS unchanged — same insert/select/update/delete policies cover the new columns.
- [src/lib/db/schema.ts](../src/lib/db/schema.ts) — Drizzle mirror updated with `PhotoSource` type + new columns.
- [src/lib/photo-utils.ts](../src/lib/photo-utils.ts) — adds `generateGooglePhotoPath()` (under a `google/` prefix) and a shared `isValidPhotoStoragePath()` guard.
- [src/lib/google/identity.ts](../src/lib/google/identity.ts) — idempotent Google Identity Services script loader + `requestAccessToken({ scope })` returning a short-lived OAuth token. Browser-only.
- [src/lib/google/photos-picker.ts](../src/lib/google/photos-picker.ts) — pure REST client for `https://photospicker.googleapis.com/v1/{sessions,mediaItems}`. Handles session create/poll/delete, media-item listing (paginated), `downloadAtSize()` with the `=w{w}-h{h}` suffix, and a duration-string parser.
- [src/components/google-photos-picker.tsx](../src/components/google-photos-picker.tsx) — Client Component: orchestrates GIS → session → poll → list → downsize-download → direct-to-Supabase upload → `recordUploadedPhoto({ source: 'google_photos', googleMediaId })`. Opens Google's hosted picker in a new tab; abortable; `router.refresh()` on success.
- [src/components/add-photos-modal.tsx](../src/components/add-photos-modal.tsx) — Sheet wrapper with two tabs (device + Google). Reused on both pages.
- [src/app/(app)/photos/actions.ts](../src/app/(app)/photos/actions.ts) — `recordUploadedPhoto` now accepts optional `source` + `googleMediaId`. Enforces that Google-source rows carry an id and non-Google rows don't.
- [src/app/(app)/properties/[slug]/page.tsx](../src/app/(app)/properties/[slug]/page.tsx) + [src/app/(app)/family/[id]/page.tsx](../src/app/(app)/family/[id]/page.tsx) — swap `<PhotoUpload>` for `<AddPhotosModal>`.

**Decisions made during build**
- **2048px maximum dimension** — typical ~200–800KB per photo (≈10× quota savings vs originals). Single size, not a thumbnail+display pair, to keep Free-tier-friendly (no Supabase image-transform dependency).
- **Storage-path prefix `google/`** is the canonical signal of source — admin dashboard can `sum() group by` against the prefix or against `photos.source`. We do both for cross-checking.
- **No server-side Google token storage**. GIS popup gives a 1hr in-memory access token; the whole pick+download flow runs in seconds. If a session genuinely takes >1hr the user re-prompts.
- **Per-pick `prompt: "consent"`** on the GIS call so the user sees the scope dialog every time — this is intentional UX, not a missing optimization. Picker's entire pitch is per-pick consent over library OAuth.
- **PhotoUpload was not refactored** — it already renders nicely inside the tab body, so keeping it untouched minimizes regression surface. The earlier plan to split out its inline UI proved unnecessary.
- **Cancellation** wired through an `AbortController` so navigating away mid-poll doesn't leak the polling loop.

**Open follow-ups (for future sessions / milestones)**
- Pre-flight: GCP project + OAuth web client + Photos Picker API enabled. Authorized JS origins: `http://localhost:3000`, `https://mathiesonfamily.app`. Set `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` in `.env.local` + `vercel env`.
- Manual smoke test in dev: pick 3 photos, confirm gallery + DB row + storage object; reload persists; non-Google upload tab still works.
- Mobile (iOS Safari) test — PRD flags this as a known clunkiness risk; revisit if family reports issues.
- Milestone 2 (Drive Picker for PDFs), 3 (family-files index page), 4 (admin storage dashboard) — see [plan](../../../.claude/plans/i-d-like-to-start-lively-flame.md).

## Implementation (what shipped 2026-05-24)

**Direct-to-Supabase upload** — fixed the production `FUNCTION_PAYLOAD_TOO_LARGE` error.

**Key files**
- [src/lib/photo-utils.ts](../src/lib/photo-utils.ts) — browser-safe utilities (PHOTOS_BUCKET, MAX_PHOTO_BYTES, MIME validation, path generation). Uses `globalThis.crypto.randomUUID()` so it works in both the browser bundle and Node.
- [src/lib/photos.ts](../src/lib/photos.ts) — server-only `withSignedUrls()`; re-exports the utilities for existing server callers
- [src/components/photo-upload.tsx](../src/components/photo-upload.tsx) — Client Component now uses the browser Supabase client to upload binary directly to Storage; binary never passes through a Vercel Function
- [src/app/(app)/photos/actions.ts](../src/app/(app)/photos/actions.ts) — `recordUploadedPhoto({ storagePath, attachment, ... })` Server Action only persists the small metadata row; size limits no longer apply

**Decisions made during build**
- **Max file size bumped 25MB → 50MB** since the Vercel Function bottleneck is gone. Matches Supabase Storage's default 50MB object limit on the Free tier.
- **Storage-path validation** on the server side: `recordUploadedPhoto` checks the path matches the format `generatePhotoPath()` produces, so a malicious client can't attach a DB row to an arbitrary storage object.
- **Orphan cleanup on insert failure**: if the DB row insert fails after a successful storage upload, we remove the storage object so we don't leak orphans.

**Open follow-ups**
- Google Photos Picker (the main goal of this PRD)
- Google Drive Picker for PDFs
- General-file upload UI + "Family files" index
- Admin storage-usage dashboard

## References / reuse

- Reuse `PhotoUpload` for non-photo uploads by extending the MIME allowlist + relaxing the `image/*` filter
- Same direct-upload pattern works for Drive files: client downloads from Drive Picker (which gives a Blob), uploads to Supabase, calls a recorder Server Action
