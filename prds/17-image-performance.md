# 17 — Image Performance

**Phase**: 2.5 (polish on shipped photo infra) · **Depends on**: 05 (direct-to-Supabase upload + signed URLs already shipped)
**Status**: 🟢 ready

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

_Not started._
