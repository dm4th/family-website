# 17 — Image Performance

**Phase**: 2.5 (polish on shipped photo infra) · **Depends on**: 05 (direct-to-Supabase upload + signed URLs already shipped)
**Status**: ✅ shipped

> Pairs with **PRD 13** (the "this image is large — we'll shrink it / suggest Google Photos" prompt). This PRD makes large images *actually fast*; PRD 13 owns the surrounding "we noticed your image is big" UX. Build them together if you can, but this one stands alone.

## Onboarding (read first if you're picking this up cold)

1. **Read** [CLAUDE.md](../CLAUDE.md), [00-master-plan.md](00-master-plan.md), [05-file-uploads.md](05-file-uploads.md), then this file.
2. **Read [AGENTS.md](../AGENTS.md) and the relevant Next.js docs in `node_modules/next/dist/docs/`** before touching display code — this is Next 16 / React 19 / Turbopack and conventions differ from your training data.
3. **The signed-URL contract is load-bearing — do NOT reach for `next/image`.** Photos are private objects in the Supabase `photos` bucket, served via **short-lived signed URLs** that are batch-minted per request (1hr TTL) in [src/lib/photos.ts](../src/lib/photos.ts) `withSignedUrls()` and [src/lib/avatars.ts](../src/lib/avatars.ts) `resolveAvatarUrls()`. Display is a plain `<img>` (see the `eslint-disable @next/next/no-img-element` lines in the galleries). `next/image`'s optimizer caches by URL and expects stable, public, long-lived sources — signed URLs rotate every request, so it would thrash the cache and leak signed URLs into the optimizer's CDN. **Keep plain `<img>`.** Every performance win here must work *within* that model.
4. **You will reuse**: `PhotoUpload` ([src/components/photo-upload.tsx](../src/components/photo-upload.tsx)) — the direct browser→Storage upload path is where client-side downscaling slots in; `generatePhotoPath()` / `MAX_PHOTO_BYTES` / `isAllowedMime()` ([src/lib/photo-utils.ts](../src/lib/photo-utils.ts)); `withSignedUrls()` ([src/lib/photos.ts](../src/lib/photos.ts)); `resolveAvatarUrls()` ([src/lib/avatars.ts](../src/lib/avatars.ts)).

## The problem

A 9.2MB JPEG uploaded from a laptop loads **very, very slowly** (logged in the [testing playbook](../docs/testing-playbook.md) Gap log, med severity). Today we store and serve **full-resolution originals as-is**: `PhotoUpload` uploads the raw `File` straight to Storage (`MAX_PHOTO_BYTES = 50MB`), and every display surface — directory avatars, property galleries, profile photo grids — pulls that same multi-megabyte object down over a signed URL. A directory page rendering 20 avatars is potentially fetching 100MB+ of full-res JPEGs to paint thumbnails the size of a postage stamp.

> Note: the **Google Photos Picker** import path already downscales to a 2048px max dimension before storing (see PRD 05's implementation notes). This PRD brings the **device-upload** path (and display renditions) up to the same standard, then layers per-context thumbnails on top.

## Goal

**Fast image loading everywhere** — directory avatars, property galleries, profile photo grids, hero images — **without abandoning the signed-URL + plain-`<img>` approach.** Concretely: the 9.2MB-JPEG case loads quickly, stored objects shrink by ~10×, and small contexts (avatars, grid thumbnails) fetch small renditions instead of full-res originals.

## In scope

- **Client-side downscale + re-encode on upload** (the baseline — see Pre-flight). Shrink images in the browser *before* the direct-to-Storage upload in `PhotoUpload`, so stored objects are far smaller. This is the single biggest win and works on any Supabase plan.
- **Per-context display renditions** — small for avatars/grid thumbnails, medium for galleries, large/full for detail/hero. Delivered via **Supabase Storage image transformations** on the signed URL *if the plan supports it*, otherwise via a couple of fixed renditions generated at upload time (see Pre-flight for the decision + fallback).
- **Lazy-loading + intrinsic dimensions** on every `<img>` — `loading="lazy"` is already present on the galleries; add `width`/`height` (or `aspect-ratio` sizing that's already there) and `decoding="async"` so large images don't block paint or cause layout shift. Avatars above the fold should stay eager.
- **Lower `MAX_PHOTO_BYTES`** to a sane post-downscale ceiling, with a friendly message (coordinated with PRD 13).
- A single rendition helper so callers don't re-implement transform-URL construction — extend `withSignedUrls()` / `resolveAvatarUrls()` to take a `rendition` ("thumb" | "display" | "full").

## Pre-flight decisions

Resolve these before building. Recommendations are pre-filled.

| Decision | Options | Recommendation |
|---|---|---|
| **Baseline approach** | (a) Client-side downscale on upload · (b) Server/edge resize on read only · (c) Do nothing, rely on lazy-load | **(a)** — shrink in-browser before upload. Smaller storage *and* smaller serving, plan-independent, and mirrors what the Google Photos path already does. |
| **Downscale max dimension** | 1600 / 2048 / 2560 px long edge | **2048px long edge** — matches the existing Google Photos import (`=w2048-h2048`), keeps one consistent "stored size," looks crisp on retina detail views. |
| **Re-encode quality / format** | JPEG q0.8 · WebP q0.8 · keep source format | **JPEG quality ~0.8** for v1 (universally decodable, predictable). Consider WebP later. Skip re-encoding GIFs (animation) and pass them through untouched. |
| **Keep the original?** | (a) Discard, store only the downsized copy · (b) Store original under an `orig/` prefix too | **(a) Discard for v1** — the family wants speed and quota headroom, not archival masters; 2048px is plenty for a web portal. Revisit only if a "download original" need appears. Document this as a deliberate, lossy choice. |
| **Display renditions: transform vs. on-upload** | (a) Supabase Storage image transformations on the signed URL · (b) Generate N fixed renditions (thumb + display) at upload time, store each | **(a) if the project's Supabase plan supports transformations; otherwise (b).** See the plan-dependency note below. Build behind one helper so the call sites don't care which is in play. |
| **Thumbnail sizes per context** | — | **Avatars: ~96px** (sm/md) / ~200px (hero) · **Gallery grid tiles: ~400px** · **Featured / property hero: ~1280px** · **Detail / full view: the stored 2048px**. Pick the next size up from the rendered CSS box, ×~2 for retina. |
| **`MAX_PHOTO_BYTES`** | Keep 50MB · Lower to ~15–25MB | **Accept up to ~25MB at the picker** (phones shoot large), but downscale before upload so *stored* objects are sub-1MB. The 50MB ceiling only ever mattered pre-downscale. |
| **HEIC handling** | Downscale in-canvas · pass through | Browsers can't always decode HEIC to canvas. **If `createImageBitmap`/canvas can't decode it, upload the original untouched** (don't fail the upload); flag HEIC for a later conversion pass. |

### Plan-dependency caveat (read before choosing the rendition path)

Supabase Storage **image transformations** (`{ transform: { width, height, quality, resize } }` passed to `createSignedUrl` / `getPublicUrl`) run on Supabase's CDN and **do work with signed URLs** — but image transformations are a **paid-plan feature** (Pro and above); they are **not available on the Free tier**. **The executing session must confirm the current plan + current Supabase docs first** (transformation support and limits have changed over time — verify against live docs, not memory).

- **If transformations are available:** prefer them. One stored 2048px object, and `withSignedUrls()` mints a signed URL carrying the per-context `transform` width/quality. No extra storage, no extra upload work, renditions are derived on demand and CDN-cached.
- **If NOT available (Free tier):** fall back to **generating a small thumbnail rendition at upload time** alongside the 2048px display copy (e.g. `<path>` for display + `<path>.thumb.jpg`), and have the helper resolve the thumb path for small contexts. More upload work and ~1 extra object per photo, but plan-independent.

Either way, the **client-side downscale baseline ships regardless** — it's the part that fixes the 9.2MB case.

## Out of scope

- Switching to `next/image` or any URL-optimizing image loader (incompatible with rotating signed URLs — see Onboarding #3).
- Public/unsigned image serving or a public bucket.
- A full responsive `srcset`/`<picture>` system (the per-context helper covers the real needs; revisit if we add a true "all photos" gallery).
- Backfilling / re-compressing the existing already-uploaded full-res objects (nice-to-have one-off migration; note it as a follow-up, don't block on it).
- WebP/AVIF re-encoding (v2), HEIC→JPEG server conversion (v2).
- Storage-quota dashboard (lives in PRD 05's later milestones).

## Likely file layout

```
src/lib/
  image-resize.ts        # NEW — browser-only: downscale + re-encode a File via
                         #       createImageBitmap/canvas → returns a smaller Blob.
                         #       Long-edge cap (2048), quality (~0.8), GIF/HEIC pass-through.
  photo-utils.ts         # EDIT — lower MAX_PHOTO_BYTES; add rendition-size constants
                         #        (THUMB/DISPLAY/FULL px) shared by client + server.
  photos.ts              # EDIT — withSignedUrls() gains a `rendition` arg; builds the
                         #        transform-bearing signed URL (or resolves the .thumb path
                         #        on the fallback branch).
  avatars.ts             # EDIT — resolveAvatarUrls() requests the small avatar rendition.

src/components/
  photo-upload.tsx       # EDIT — run the File through image-resize.ts before the
                         #        supabase.storage.upload(); update the size hint copy.
  profile-avatar.tsx     # EDIT — width/height/decoding on <img> if needed (uses <AvatarImage>).

# Display surfaces — request the right rendition + add intrinsic sizing
src/app/(app)/family/page.tsx                              # directory avatars → thumb
src/app/(app)/family/[id]/page.tsx                         # profile photo grid → thumb/display
src/app/(app)/family/[id]/photo-gallery.tsx                # gallery tiles → thumb; featured → display
src/app/(app)/properties/page.tsx                          # property list cards → display
src/app/(app)/properties/[slug]/page.tsx                   # hero → display/full
src/app/(app)/properties/[slug]/property-gallery.tsx       # grid tiles → thumb
```

(`withSignedUrls`/`resolveAvatarUrls` callers also live in `src/lib/properties.ts` — keep its rendition default sensible.)

## Verification recipe

1. **Re-test the 9.2MB JPEG (the headline case).** Upload that same 9.2MB laptop JPEG via `PhotoUpload`. Confirm: (a) it uploads without error, (b) the **stored object** in the `photos` bucket is now sub-1MB (~200–800KB, like the Google Photos path), and (c) the gallery and the photo render **fast** — no multi-second wait. This row in the [testing playbook](../docs/testing-playbook.md) Gap log should flip to resolved.
2. **Directory speed.** Open `/family` with ≥10 members who have photo avatars. Confirm avatars fetch the **small** rendition (check the Network panel — each avatar request is small KB, not full-res MB), and the page paints quickly. Avatars above the fold load eagerly; below-the-fold lazy.
3. **No layout shift.** Scroll the property and profile galleries; tiles reserve their space (aspect-ratio boxes already present) and don't reflow as images arrive.
4. **Renditions are right per context.** Spot-check Network requests: grid thumbnails request thumb-sized images, the property hero / featured photo requests the larger display size, the full detail view can request the stored 2048px.
5. **Signed URLs still rotate + still work.** Reload a gallery page; signed URLs change per request (1hr TTL) and images still load — confirms we didn't break the signed-URL model or accidentally pin a stale URL.
6. **Plan-fallback branch.** If on a transformations-capable plan, temporarily exercise the fallback path (or test on a Free-tier project) to confirm thumb generation-on-upload also works and the helper resolves the right path.
7. **GIF + HEIC pass-through.** Upload an animated GIF (stays animated, not flattened) and a HEIC from an iPhone (uploads successfully even if not downscaled).
8. **Mobile.** Upload from an iPhone; confirm the in-browser resize doesn't hang the device and the upload completes.
9. **Build hygiene.** `tsc --noEmit` clean, `eslint` clean on changed files, `npm run build` succeeds. The `@next/next/no-img-element` disables stay (we're intentionally not using `next/image`).

## Implementation

**Status: code-complete AND live-verified in a real logged-in browser against the hosted Supabase. Static checks green (tsc + eslint + `npm run build`); headline downscale, per-context renditions, and graceful fallback all confirmed end-to-end (see "Live verification results").**

### Rendition strategy chosen

**Thumb-on-upload (Free-tier-safe)** — confirmed with the owner rather than Supabase Storage image transformations. Each device upload now stores **two** objects: a 2048px display copy at the primary path and a ~400px thumbnail companion. No paid-plan dependency.

### How it fits together

- **Client-side downscale baseline (the headline fix).** New [src/lib/image-resize.ts](../src/lib/image-resize.ts) — browser-only `prepareImageForUpload(file)` uses `createImageBitmap` (with `imageOrientation: "from-image"`) + `<canvas>.toBlob('image/jpeg', …)` to produce a 2048px-max display JPEG (q≈0.82) **and** a 400px-max thumb (q≈0.72). GIF and HEIC/HEIF, plus anything the browser can't decode to a bitmap, **pass through untouched** (`passthrough: true`, no thumb) so an upload never fails. [photo-upload.tsx](../src/components/photo-upload.tsx) runs every file through it, uploads the display copy at the primary path, then best-effort uploads the thumb at the derived path. The Google Photos path ([google-photos-picker.tsx](../src/components/google-photos-picker.tsx)) already downscaled to 2048; it now also generates a thumb via `makeThumbnailFromBlob()` for parity.
- **Thumb path convention.** `thumbPathFor("ab/uuid.jpg") → "ab/uuid_thumb.jpg"` (handles the `google/` prefix), in [photo-utils.ts](../src/lib/photo-utils.ts). Deterministic, so the signing helpers derive it with **no DB column**. Thumbs are never written to the `photos` metadata row, so `isValidPhotoStoragePath` is unchanged and the metadata contract is untouched.
- **One helper, two URLs, graceful fallback.** `withSignedUrls(photos, rendition)` and `resolveAvatarUrls(profiles, rendition)` gained a `rendition` arg (`"thumb" | "display" | "full"`, default `"full"` → existing callers unaffected). For `"thumb"` they batch-sign the thumb **and** the full object in a single `createSignedUrls` call and return `signedUrl` (thumb) **plus** `fallbackUrl`/`ResolvedAvatar.fallbackUrl` (full). Any photo lacking a thumb (pre-PRD uploads, HEIC/GIF, Google imports that failed thumb-gen) signs the thumb path to a URL that 404s at fetch time, and the **`<img onError>` swaps to the full object** — so missing thumbs are never fatal and no backfill is required.
- **Per-context wiring.** Directory avatars (`/family`) → `thumb`. Profile photo grid + property gallery → `thumb` for tiles; the **featured tile and the property hero read `fallbackUrl` (full)** for a crisp large image — the dual-URL return means one query serves both sizes. Profile hero avatar and property list cards stay on the full/display object (already large contexts). All thumbnailed `<img>`s went through small client components (`TileImg`, and `ProfileAvatar` is now a client component) that own the onError fallback.
- **Lazy-load + intrinsic sizing.** `decoding="async"` added across the photo `<img>`s; existing `loading="lazy"` kept (featured/hero are eager); aspect-ratio boxes that already reserved space handle layout shift.
- **`MAX_PHOTO_BYTES` lowered 50MB → 25MB** with copy updated ("large photos are optimized for fast loading"). Stored objects are now sub-1MB regardless.

### Key decisions / gotchas

- **State reset on rotating signed URLs.** `TileImg`/`ProfileAvatar` track the shown URL in state for the onError swap. Since signed URLs rotate every request, a remount-less prop change must reset that state — done via the **"adjust state during render"** pattern (compare against a `seenSrc` state), not a `useEffect(setState)` (which trips `react-hooks/set-state-in-effect`).
- **`display` vs `full` are identical today** (single 2048px stored object). The distinction is kept so call sites read intentfully and a future medium rendition has a home.
- **Thumb uploads are best-effort and not transactional** with the display object — acceptable because the fallback covers a missing thumb.

### Thumb cleanup on delete (caught during live verification)

Photo deletion ([photos/actions.ts](../src/app/(app)/photos/actions.ts) `deletePhoto`, and the insert-failure cleanup in `recordUploadedPhoto`) only removed `storage_path`. With thumb-on-upload that would orphan every `_thumb` companion. Both `.remove()` calls now also remove `thumbPathFor(storagePath)` (a no-op for thumbless old/HEIC/GIF photos). **Verified live**: deleting the test photo removed both the display object and its thumb (0 rows, 0 storage objects remaining).

### Key files

- NEW [src/lib/image-resize.ts](../src/lib/image-resize.ts) · EDIT [photo-utils.ts](../src/lib/photo-utils.ts) (`MAX_PHOTO_BYTES`, rendition constants, `thumbPathFor`, `Rendition` type) · [photos.ts](../src/lib/photos.ts) + [avatars.ts](../src/lib/avatars.ts) (`rendition` arg + dual-URL return) · [profile-photos.ts](../src/lib/profile-photos.ts) (signs `thumb`) · [photos/actions.ts](../src/app/(app)/photos/actions.ts) (thumb cleanup on delete) · [photo-upload.tsx](../src/components/photo-upload.tsx) · [google-photos-picker.tsx](../src/components/google-photos-picker.tsx) · [profile-avatar.tsx](../src/components/profile-avatar.tsx) (client + fallback) · display surfaces: `family/page.tsx`, `family/[id]/page.tsx` + `photo-gallery.tsx`, `properties/[slug]/page.tsx` + `property-gallery.tsx`, `properties/page.tsx`.

### Live verification results

Run in the owner's logged-in Chrome against the hosted Supabase project, driving the real shipped browser code (the upload was dispatched to the actual `PhotoUpload` file input; sizes read authoritatively from `storage.objects`):

- **Step 1 (headline) ✅** — uploaded a 6.25MB / 20MP JPEG through `PhotoUpload`. Stored **display = 129KB (2048px-capped)** + **thumb = 12KB**, down from 6.25MB. (A synthetic gradient compresses unusually well; the point is the downscale + thumb both fired and the object is sub-1MB.)
- **Step 4 (renditions per context) ✅** — the uploaded photo's grid tile loaded its `_thumb` at **400px long edge**; the featured tile and the directory avatar loaded the **full** object. One query serves both via the dual-URL return.
- **Graceful fallback ✅** — the directory avatar for a thumbless pre-PRD photo requested the (missing) thumb, 404'd, and `onError` swapped to the full object, which rendered (briefly shows initials while the full image loads — acceptable until backfill).
- **Step 5 (signed-URL rotation) ✅** — each reload re-signed with fresh tokens; images still loaded.
- **Copy + limit ✅** — the picker shows "up to 25MB each · large photos are optimized for fast loading"; `MAX_PHOTO_BYTES` is 25MB live.
- **Thumb cleanup on delete ✅** — see above.
- **Step 9 (build hygiene) ✅** — tsc + eslint + `npm run build` all green.

**Not exercised** (data/environment limits, low risk): step 2 at scale (the test data has only 2 members, 1 with a photo avatar — the *mechanism* is proven but not the many-avatars case); step 3 layout-shift scroll (aspect-ratio boxes are structural); step 6 plan-fallback (N/A — thumb-on-upload *is* the chosen path); step 7 GIF/HEIC pass-through (covered by the passthrough branch, not run live); step 8 mobile. The testing-playbook Gap-log row for the 9.2MB case can be marked resolved.

### Follow-ups

- **Backfill** existing pre-PRD full-res objects (re-compress + generate thumbs) — currently they serve the full object via fallback, so an un-backfilled directory avatar loads a multi-MB original. Out of scope per the PRD; note as a one-off migration.
- WebP/AVIF re-encode (v2); server-side HEIC→JPEG conversion (v2); storage-quota dashboard (PRD 05).
