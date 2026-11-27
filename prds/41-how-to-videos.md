# 41 — How-To Videos

**Phase**: 2 · **Depends on**: nothing to build. **Gated on one owner decision**: the storage plan (see the decision grid). Today's Supabase Free tier caps a single file at 50 MB, which holds only about 30–60 seconds of phone video.
**Status**: 📝 **draft, awaiting Dan's sign-off** (requested by Dad in an email on 2026-11-17, approved for a PRD by Dan on 2026-11-26).
**Parallel-safe with**: most PRDs. It adds a new table and a new bucket and touches one existing surface (the property detail page).

---

## Why this exists

Dad wants **short instructional videos**, for example "how to clean the boat" or "how to clean the grill". These are the "how things work here" knowledge the property pages already hold as Markdown ([03](03-properties.md) `how_to`), except some of it is much easier to show than to write. A 90-second clip of someone flushing the outboard beats three paragraphs about it.

So the videos belong **on the property they're about**. They aren't a new top-level "Videos" area. A member planning a stay at Loon-A-See should find the boat video on the Loon-A-See page next to the wifi password. A clip that isn't about one place, such as a general "how to use the family calendar", goes in an optional shared library.

## User stories

- As Dad, I film a two-minute clip on my iPhone at the dock, open the Loon-A-See page on my phone, tap **Add a how-to video**, give it a title, and it uploads. It survives a weak signal by resuming instead of starting over.
- As a member at the cabin, I open the property page and see a **How-to videos** section with titled thumbnails. One tap plays it inline, and it works on my iPhone, my Android and my laptop.
- As whoever knows the grill best, I replace a video with a better take, and the old one is retained in the history rather than lost.
- As an admin, I can see how much video storage we're using so the bill never surprises us.

## Pre-flight decision grid (needs Dan's sign-off)

| Decision | Recommendation | Notes |
|---|---|---|
| **Where videos are stored** | **Supabase Storage, new private `videos` bucket**, same auth + RLS as everything else | The alternatives: **YouTube unlisted** is free, but "unlisted" isn't private and it puts family content on a Google account. **Mux / Cloudflare Stream** (~$5–20/mo) add transcoding and adaptive streaming, but bring a new vendor, new keys and webhooks, and access control outside RLS. For a family-sized library of short clips, plain MP4/MOV files behind signed URLs play fine. Revisit Mux only if playback quality becomes a real complaint. |
| **Storage plan** ⚠️ *the gate* | **Upgrade Supabase to Pro ($25/mo)** before building | Free tier: 1 GB total (about 100 MB used today) and a **50 MB per-file cap**. iPhone 1080p video runs about 60–130 MB per minute, so a single 2-minute clip doesn't fit. Pro gives 100 GB included, per-file limits up to 500 GB (set ours to ~1 GB), resumable uploads, daily backups, and no project pausing. Those last two matter for the whole site, not just videos (see Dad's hosting question in Open follow-ups). **Executing session: confirm the current plan and limits against live Supabase docs before building.** |
| **Max length / size** | **~1 GB per file, soft guidance "under 5 minutes"** | Instructional, not home movies. Long family films are a different feature (Legacy, [11](11-family-legacy.md)). |
| **Transcoding** | **None in v1.** Accept MP4 and MOV as recorded; play with a native `<video>` element | iPhones record HEVC (.mov). That plays in Safari, Chrome and Edge on current macOS, Windows and Android with hardware decode. The rare failure case (old Windows without HEVC support) gets a clear "Download to watch" fallback. If this bites in practice, add server-side transcoding later (Mux, or an ffmpeg job), which is a contained follow-up. |
| **Upload path** | **Browser → Storage directly via TUS resumable upload** (`tus-js-client` against Supabase's resumable endpoint), never through a Vercel Function | The 4.5 MB Vercel body limit ([05](05-file-uploads.md) lesson) rules out proxying. Resumable matters because these come from phones at the lake. |
| **Thumbnails** | **Captured in the browser at upload time**: draw a frame at ~1s to a `<canvas>`, store a small JPEG next to the video | Same plan-independent posture as PRD 17's thumbnail-on-upload. No server-side ffmpeg. |
| **Who can add / edit / delete** | Add: any member. Edit title/description/order: any member (wiki posture, revisions logged). Delete: uploader, property admins, site admins | Matches property photos. Guests can **watch** videos on properties they're scoped to, and can't upload. |
| **Where they live** | **Per property** (`property_id` set), plus an optional shared library (`property_id` null) at `/videos` | The library is slice 2. It ships only if Dad actually has non-property clips. |

## Data model (slice 1)

`property_videos`:
- `id`
- `property_id` (FK, nullable for the shared library)
- `title` (required)
- `description` (Markdown, optional)
- `storage_path` (UUID path in `videos`)
- `thumb_path`
- `mime_type`
- `size_bytes`
- `duration_seconds`
- `sort_order`
- `uploaded_by` (FK → profiles, ON DELETE SET NULL)
- `replaces_id` (for "replace with a better take")
- timestamps

RLS mirrors `photos`:
- Read: active members, and guests scoped to that property.
- Insert: active members, with `uploaded_by = auth.uid()`.
- Update: active members (revisions via `recordRevision()`).
- Delete: uploader, property admin or site admin.
- Add PRD-26-style active-only restrictive policies **from day one**. PRD 40 found that later tables missed them.

The bucket is private, with storage policies that mirror the table. Playback uses **batch-signed URLs** (the existing photo pattern), and the TTL must outlast a playthrough (~1 hour).

## Build slices

1. **Slice 1: property videos.** Migration (bucket + table + RLS + negative suite). A **How-to videos** section on `/properties/[slug]`, below how-to/guidelines: a thumbnail grid and inline `<video controls playsinline preload="metadata">` with a signed URL. An **Add a how-to video** flow: pick or record (`accept="video/*"`, `capture` on mobile), title, resumable upload with a progress bar and resume-on-reconnect, client-side duration and thumbnail capture, then the server action records the row. Edit title and order, replace, and delete. Older-user bar (PRD 29): big targets, calm copy, a clear "Uploaded, it's on the page now" ending.
2. **Slice 2: shared library + storage meter.** `/videos` for non-property clips (only if wanted), and an admin storage usage line (sum of `size_bytes` by bucket vs plan quota) on the admin page.

## Likely file layout

```
supabase/migrations/<ts>_property_videos.sql
src/lib/videos/shared.ts           # bucket name, size cap, mime allowlist, path scheme
src/lib/videos/upload.ts           # tus-js-client wrapper (resumable, progress, retry)
src/lib/videos/thumbnail.ts        # <video> → <canvas> frame grab + duration
src/components/videos/video-upload.tsx
src/components/videos/video-grid.tsx
src/app/(app)/properties/[slug]/videos/actions.ts
```

New dependency: `tus-js-client`.

## Verification recipe

- **Negative suite (prod, rolled-back transaction, real JWTs):**
  - A guest scoped to property A can't read property B's videos or objects, and can't insert.
  - A deactivated member reads nothing.
  - A member can't delete another member's video unless they're a property or site admin.
- **Real-device walk:** record on an iPhone, upload over cellular, kill the connection mid-upload and confirm it resumes, then confirm playback on iPhone Safari, Android Chrome, and desktop Chrome and Safari.
- `tsc`, `eslint` and `next build` all pass.

## Out of scope

Transcoding and adaptive streaming, captions and transcripts (a possible later AI slice: auto-transcribe so the how-to text is searchable), editing or trimming in the browser, comments, and long-form family films.

## Open follow-ups

- **Dad's hosting question** ("where is it hosted, how do we keep it secure, is there a fee, when should we switch to that kind of relationship?"). The answer, for Dan to relay:
  - The site runs on **Vercel** (Free) plus **Supabase** (database, storage and login; Free tier unless upgraded).
  - Both are SOC 2 audited, and encrypt data in transit and at rest.
  - The free tiers' real gaps are **no automatic daily backups** and **a project that can pause after inactivity** on Supabase, plus Vercel Free's non-commercial-use terms.
  - The "right time to pay" is now-ish, and **this PRD forces it anyway**: Supabase Pro at $25/mo is the meaningful upgrade. Vercel Pro ($20/mo) is optional at this traffic level.
- Captions/transcripts via AI as a follow-up, which would also let a future assistant answer "how do I clean the grill?" from the video.
