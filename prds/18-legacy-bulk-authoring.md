# 18 — Legacy Bulk Authoring (people import + zip photo upload)

**Phase**: 5 · **Depends on**: 11 (Family Legacy — `people`, `albums`, `photo_people`, `relationships` all live), 12 (authoring layer), 05 (`PhotoUpload` pipeline), 17 (client downscale + thumb)
**Status**: ✅ shipped (slices 1 & 2, 2026-07-01) — CSV people import + zip photo upload built, PR'd. Slice 3 (Google Photos multi-import) deferred as an optional follow-up. See [Implementation](#implementation). No migration required.

---

## Why this exists

Family Legacy shipped four slices (Archive · Tree · Timeline · Stories) but they launch **empty**, and the only way to fill them today is one-at-a-time forms: one `people` row per person via the tree's "Add a Person" flow, one photo at a time via `PhotoUpload`. Populating the real family — dozens of ancestors, hundreds of scanned photographs — through that UI is the wall Dan hit. This PRD makes **entering content in bulk** feel light, so the Legacy surfaces actually get used.

Two concrete jobs:
1. **Bulk people import** — hand the site a spreadsheet of relatives (living + ancestors) and get real `people` rows, deduped and attributed, without typing each one.
2. **Zip photo upload** — drop a `.zip` of scans into an album and have every image go through the existing downscale + thumb pipeline, marked archival, ready to date and tag.

## Goal

A non-technical family member can go from "a spreadsheet of relatives and a folder of scans" to "a populated tree and a full archive album" in two guided flows, each with a **preview-before-commit** step and full attribution/revision history, without ever hand-entering rows or uploading photos one by one.

## Onboarding (read first if you're picking this up cold)

1. **Read** [CLAUDE.md](../CLAUDE.md), [00-master-plan.md](00-master-plan.md), [11-family-legacy.md](11-family-legacy.md) (the data model you're filling), then this file.
2. **Read [AGENTS.md](../AGENTS.md)** and the Next.js docs in `node_modules/next/dist/docs/` before adding any dependency — this is Next 16 / React 19 / Turbopack. A client-side unzip lib (e.g. JSZip) and a CSV parser (e.g. PapaParse) are the likely new deps; **verify compatibility first** and keep them client-only where possible.
3. **You will reuse heavily** (don't reinvent):
   - `people` / `albums` / `album_photos` / `photo_people` / `relationships` tables (PRD 11) — insert into them, don't reshape.
   - `PhotoUpload` internals + `recordUploadedPhoto` (`src/app/(app)/photos/actions.ts`) — the **direct-to-Storage** upload (bypasses the 4.5 MB Vercel Function limit) and the PRD-17 **client downscale + 400px thumb**. Bulk upload must go through this same path, once per file.
   - `PeoplePicker` / `FuzzyDateField` / `CreateFlow` (PRD 12 authoring layer).
   - `recordRevision()` for every created/updated entity.
   - `is_admin()` / `requireAdmin()` if the flows end up admin-gated (see open question).
4. **The attribution guardrail (PRD 11) applies at scale here.** `people` / `relationships` / `albums` have open wiki RLS and **no audit-column trigger**. Every row this importer creates must set `created_by`/`updated_by` = `auth.uid()` and record a revision — the same rule as the single-row forms, just in a loop. This is the primary reviewer check.

## Pre-flight decisions (decide before code)

| Decision | Recommendation | Why |
|---|---|---|
| **People import format** | **CSV first** (a documented column set); GEDCOM later | A spreadsheet is what the family actually has; GEDCOM parsing is heavy and genealogy-app-specific. Ship the 90% path. |
| **Relationships in the import** | **v1: people only. v2: optional `parent_of` / `spouse_of` columns** referencing another row by a stable key | Importing edges needs a way to reference rows that don't have UUIDs yet. Prove people-import first, layer edges on. |
| **Dedup strategy** | Case-insensitive match on `display_name`; the preview shows **New / Duplicate (skip) / Duplicate (update)** per row, family chooses | Re-running an import must not double the family. Never silently merge. |
| **Preview before commit** | **Required.** Parse → show a table of what will be created/skipped/updated → explicit "Import N people" button | Non-technical safety; bulk writes are scary without a dry run. Nothing is written until confirm. |
| **Zip unpack** | **Client-side** (unzip in the browser), then upload each image through the existing direct-to-Storage + downscale path | Server-side unzip would route bytes through a Vercel Function (4.5 MB cap) and skip the client downscale. Client-side keeps both. |
| **Bulk photo dating** | Read **EXIF `DateTimeOriginal`** per file → prefill `taken_on`; plus a "set an era for all" control (`circa`) | Most value for the timeline comes from dates; auto-EXIF removes the tedium, era-for-all handles undated scan batches. |
| **Who can bulk-import** | **Any family member** (decided 2026-07-01) | Matches the site-wide wiki posture — bulk import is just single-row authoring in a loop. The mandatory preview-before-commit + per-row revision history keep it safe and reversible, so no admin gate is needed. Guests still cannot reach the import routes. |

## In scope

### Slice 1 · Bulk people import (CSV)
- A route (e.g. `/family/tree/import` or `/family/legacy/import`, Family mode) to **upload a CSV**, or paste rows.
- **Documented column set**, mapping 1:1 to `people`: `display_name` (required), `given_name`, `family_name`, `birth_date` (ISO) **or** `birth_circa`, `death_date` **or** `death_circa`, `family_branch`, `bio`. Provide a **downloadable template** so the family fills the right columns.
- **Parse + validate + preview**: a table showing each parsed row, its dedup verdict (New / Duplicate), and any validation warnings (bad date, missing name). Bad rows are skippable, not fatal.
- **Commit**: a Server Action that inserts the confirmed rows, each with `created_by`/`updated_by` + `recordRevision({ entityType: "person", … })`. Returns a summary (N created, M skipped).
- Ancestors import with `profile_id = null` (no account) — the whole point.

### Slice 2 · Zip photo upload into an album
- On an album page (`/family/archive/[albumId]`) and/or a new-album flow: a **"Upload a Zip"** affordance alongside the existing single/multi `PhotoUpload`.
- **Client-side**: unzip → filter to images (jpg/png/heic/gif/webp) → for each, run the existing **downscale + thumb** and **direct-to-Storage** upload, then `album_photos` link + `is_archival = true`.
- **Progress UI** — N of M uploaded, per-file success/fail, resilient to a single bad file (skip + report, don't abort the batch).
- **EXIF date prefill** + a "set circa for all" control writing `taken_on` / `circa` on the batch.
- Reuse the slice-1 `photo_people` tagging (`PeoplePicker`) so a batch can be tagged with the people in it after upload.

### Slice 3 (optional) · Google Photos → new album (multi-import)
- Reuse the existing **Google Photos Picker** (`src/components/google-photos-picker.tsx`, per-pick consent). Let the user multi-select many items at once → create an Archive album → import all as archival photos.
- **Constraint to document loudly:** the Picker API only returns **user-selected items**, not whole-album metadata — there is no silent "mirror this Google album." This is "pick many and import," not "sync." (Answered in the 2026-07-01 scoping thread.)

## Out of scope (initial)
- GEDCOM / Ancestry / FamilySearch import (revisit if the family has a genealogy file).
- Automatic face recognition / auto-tagging people in bulk photos.
- Editing relationships *from* the CSV beyond the optional v2 `parent_of`/`spouse_of` columns.
- Server-side zip processing / background jobs (client-side is sufficient at family scale).
- Video.

## Sequencing

1. **CSV people import** (+ downloadable template + preview/commit). The unlock for the tree.
2. **Zip photo upload into an album** (+ EXIF dating + batch tagging). The unlock for the archive.
3. **Google Photos multi-import** (optional; reuses the picker). Nice-to-have once 1–2 land.

Each slice: branch, ship, fill Implementation, flip status here + in the master-plan queue.

## Cross-cutting decisions

| Decision | Recommendation | Why |
|---|---|---|
| **Attribution at scale** | Loop the single-row guardrail: every created row sets `created_by`/`updated_by` + a revision | Keeps bulk-created content attributable + reversible, same as hand-entry. |
| **Idempotency** | Dedup on `display_name`; re-import is safe (skips or updates, never doubles) | The family will re-run imports as they clean the spreadsheet. |
| **Upload path** | Client unzip → existing per-file direct-to-Storage + downscale pipeline | Preserves the 50 MB-not-4.5 MB ceiling and the PRD-17 renditions. |
| **Partial failure** | Skip-and-report per row/file; never abort the whole batch | One malformed row/photo shouldn't lose the other 200. |
| **New deps** | Client-only CSV + unzip libs, Next16/React19-verified; none server-side | Per AGENTS.md. |

## Verification recipe (per slice)

- **CSV import**: download the template → fill 5 relatives (2 ancestors with only `birth_circa`, no account) → upload → preview shows 5 New → commit → all 5 appear in `/family/tree`; ancestors have `profile_id null`; each has a `revisions` row. Re-upload the same file → preview shows 5 Duplicate, 0 created.
- **Bad rows**: a CSV with one missing `display_name` and one bad date → those two flagged in preview, the rest importable.
- **Zip upload**: drop a 30-photo `.zip` into an album → progress reaches 30/30 → tiles render fast (400px thumbs, per PRD 17) → an EXIF-dated photo lands with `taken_on` set → they appear on `/family/timeline` in the right year.
- **Zip resilience**: a zip with one corrupt image + one non-image file → both skipped-and-reported, the rest upload.
- **Attribution**: after a bulk import, spot-check `people` / `photos` rows have `created_by` set and revisions recorded.
- **RLS**: unauthenticated hit → nothing writes; a guest → cannot reach the import routes.

## Likely file layout

```
src/app/(app)/family/(legacy)/import/            # or under /family/tree/import
  page.tsx                     # CSV upload + preview + commit (Family mode)
  import-actions.ts            # parseAndPreview (pure), commitPeopleImport (Server Action)
  people-import-preview.tsx    # the New/Duplicate/skip table (client)
  people-template.csv          # downloadable column template

src/app/(app)/family/archive/[albumId]/
  zip-upload.tsx               # client: unzip → per-file downscale+upload → album link
  # reuses recordUploadedPhoto + the PRD-17 pipeline; adds is_archival + album_photos

src/lib/legacy-import.ts       # pure: CSV parse, column mapping, dedup verdicts, EXIF read
```

## References / reuse
- `people` / `albums` / `album_photos` / `photo_people` / `relationships` (PRD 11) — insert targets
- `src/components/photo-upload.tsx` + `src/app/(app)/photos/actions.ts` (`recordUploadedPhoto`) — the upload pipeline to loop
- PRD 17 client downscale + 400px thumb — must run per file in the batch
- `PeoplePicker` / `FuzzyDateField` (`src/components/authoring/`) — tagging + dating
- `recordRevision()` (`src/lib/revisions.ts`) — attribution/undo
- `src/components/google-photos-picker.tsx` — the multi-import path (slice 3)

## Implementation

Slices 1 & 2 (the content unlock) built 2026-07-01. Slice 3 (optional Google Photos
multi-import) deferred as a follow-up. tsc + eslint + `next build` all green. **No new
migration** — inserts only into existing tables and uses existing columns
(`photos.taken_on` / `photos.circa` already exist), so nothing to apply to prod.

**New client-only deps** (Next 16 / React 19 verified via `next build`): `jszip`
(client unzip) and `exifr` (EXIF `DateTimeOriginal`). Both are **dynamically imported**
inside the zip-upload run handler so they never touch the album page's initial bundle.
CSV parsing is **hand-rolled** (no dep) as a pure, unit-tested function.

### Slice 1 — CSV people import ✅

- **Route**: [`/family/tree/import`](../src/app/(app)/family/tree/import/page.tsx) (Family mode).
  Server component: guest 404 guard (`resolveViewer`), fetches existing lowercased
  display names for the dedup preview.
- **Pure lib**: [`src/lib/legacy-import.ts`](../src/lib/legacy-import.ts) — RFC-4180-ish
  `parseCsv` (quoted fields, embedded commas/newlines, `""` escapes, CRLF, BOM),
  `parsePeopleCsv` (header→column mapping, per-row validation, ISO-date checks),
  `computeVerdicts` (case-insensitive dedup vs existing **and** in-file), and the
  `PERSON_IMPORT_TEMPLATE` (single source of truth for the downloadable template).
  Column set maps 1:1 to `people`; only `display_name` required.
- **Preview-before-commit**: [`people-import.tsx`](../src/app/(app)/family/tree/import/people-import.tsx)
  (client) — upload **or** paste, a per-row table with New / Already-in-the-tree /
  Repeated-in-file verdicts, per-row include checkboxes (new rows pre-checked,
  duplicates unchecked so a re-run adds nothing), inline validation warnings, and a
  client-side template download.
- **Commit**: [`commitPeopleImport`](../src/app/(app)/family/tree/import/import-actions.ts)
  re-sanitizes each row, **re-checks dedup against the DB** (authoritative + batch-local
  so a re-run is idempotent), inserts with `created_by`/`updated_by` + a `person`
  `recordRevision` each — the single-row guardrail looped. Rows fail independently;
  returns `{ created, skippedDuplicate, failed, errors }`.
- **Entry points**: links from the tree page (empty state + helper text) → import route.

### Slice 2 — Zip photo upload ✅

- **Component**: [`zip-upload.tsx`](../src/app/(app)/family/archive/[albumId]/zip-upload.tsx)
  on the album page, beside the existing single `PhotoUpload`. Client unzip (JSZip) →
  filter to images (jpg/png/webp/gif/heic/heif; skips `__MACOSX/`, dotfiles, non-images)
  → per file: read EXIF `DateTimeOriginal`, run the **existing** `prepareImageForUpload`
  (PRD-17 2048px display + 400px thumb) → **direct-to-Storage** upload → `recordUploadedPhoto`.
  The bytes never hit a Vercel Function, so the 4.5 MB body cap and the renditions both hold.
- **Dating**: EXIF prefills `taken_on` per photo; an optional "era for all" fills `circa`
  on the **undated** only.
- **Progress + resilience**: N-of-M with the current filename; a corrupt image / oversize /
  non-image is skipped-and-reported in a collapsible list, never aborting the batch.
- **Batch tagging**: after upload, a `PeoplePicker` + [`tagPhotosWithPeople`](../src/app/(app)/family/archive/actions.ts)
  applies the same people to every uploaded photo (idempotent upsert on the composite PK).
- **Shared-infra change**: `recordUploadedPhoto` gained optional `takenOn`/`circa` params
  (additive; guarded to album kind and to one column; no behavior change for the single
  uploader or the Google picker).

### Auth / attribution (the primary reviewer check)

RLS is the guarantee, matching the sibling single-row actions: `people` insert and
`photo_people` insert both carry `with check (not public.is_guest())`, so guests are
blocked at the DB even though the routes also 404 them. Every created `people` row sets
`created_by`/`updated_by` + records a `person` revision; every photo carries `uploaded_by`
(same as single upload — photo creation records no revision by existing convention).

### Verification

- `parseCsv` / `parsePeopleCsv` / `computeVerdicts` / `isValidIsoDate` validated with a
  throwaway `tsx` harness (25 assertions: quoting, escapes, CRLF, blank lines, bad dates,
  header mapping, dedup existing + in-file, fatal missing-column, template round-trip).
  Not committed — the repo has no test framework; adding one was out of scope.
- tsc + eslint + `next build` green (route `/family/tree/import` present; album route
  compiles with the zip uploader).
- **Not yet live-verified in a browser against Supabase** (no local Supabase session in
  this build environment) — recommend the PRD's per-slice manual recipe before prod.

### Follow-ups

- **Slice 3 (Google Photos multi-import)** — deferred; the existing picker imports to
  profile/property attachments only, so an album-attachment + new-album flow is net-new work.
- **Duplicate → update** dedup verdict — v1 ships New + Duplicate(skip); "update existing"
  needs a by-id match UX and was left out to keep the commit path safe/simple.
- Relationship columns (`parent_of`/`spouse_of`) — still v2, per the pre-flight decision.
