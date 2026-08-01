# 35 — Hero Photo Picker

**Phase**: 7 (authoring assist) · **Depends on**: 05 (photo upload/delete), 17 (renditions)
**Status**: 🟢 ready (2026-07-31)
**Parallel-safe with**: 36, 37, and most feature PRDs (touches the property detail page + gallery + one action; no schema, no intake surface).

---

## Why this exists

Dan spotted it in real use: Dad uploaded two photos to Loon-A-See and whichever one landed last became the property's face. There is no way to choose. The gap is half-built already — `properties.hero_image_path` exists in the schema, the **listing cards honor it**, and the PRD-27 column guard already restricts writing it to property admins — but the **property detail page ignores the column entirely** (it takes the newest photo, `page.tsx` orders by `created_at desc` and calls `signedPhotos[0]` the hero), and **no UI anywhere writes it**. This PRD finishes the plumbing and adds the picker.

## Goal

A property admin can look at any photo in a property's gallery and say "make this the hero." That choice shows up as the hero on the property detail page **and** the listing card, survives new uploads, and degrades gracefully (no explicit choice → newest photo, exactly today's behavior).

## What already exists (don't rebuild)

| Piece | State |
|---|---|
| The column | `properties.hero_image_path` (`src/lib/db/schema.ts` ~line 83) — text, nullable |
| Write authorization | DB trigger from PRD 27 (`supabase/migrations/20260702000003_property_column_guard.sql`) already restricts `hero_image_path` writes to property admins. **No migration needed** — confirm at build time. |
| Listing behavior | `src/lib/properties.ts` ~line 53: `hero_image_path ?? newest photo ?? null` — this is the fallback semantics the detail page should adopt |
| App-side admin check | `canManageProperty()` in `src/lib/property-auth.ts` — site admins and property admins both qualify; any new admin-gated property op goes through it |
| Gallery + delete | `property-gallery.tsx` with `RemovePhotoButton` (also inline on the hero at `page.tsx` ~151); delete copy currently says "The next most recent photo will become the hero." |
| Revisions | `recordRevision()` — every property mutation records one |

## Pre-flight decisions

| Decision | Recommendation | Why |
|---|---|---|
| **Where the control lives** | A "Make This the Hero" action on each non-hero photo in the gallery, visible only when `canManageProperty()` — same placement idiom as the existing per-photo Remove control. The current hero gets a quiet "Hero" marker instead of a button. | The choice happens where you're looking at the candidates. No new page, no settings form. |
| **What gets stored** | The photo's `storage_path` into `hero_image_path` (matching what the listing fallback already reads). | The column and the listing code already speak this format. |
| **Fallback semantics** | Detail page resolves hero as `hero_image_path → matching photo` else newest photo. If the stored path matches no current photo (deleted, or path drift), fall back silently to newest — never a broken image. | Zero-config properties keep today's behavior; a dangling path degrades instead of breaking. |
| **Hero deletion** | When `deletePhoto` removes the photo whose `storage_path` equals the property's `hero_image_path`, null the column in the same action. | Don't leave a dangling pointer on purpose when we can see it happening. The read-side fallback still guards the racy/historical cases. |
| **Un-setting** | A "Use Newest Photo" affordance on the current hero (clears the column). Small, but without it the first explicit choice is permanent. | Reversibility is a house rule (PRD 30). |
| **Revision** | `recordRevision` on set and clear, like every other property mutation. | The audit posture doesn't make exceptions for cosmetics. |

## In scope

- New server action `setHeroPhoto(propertyId, storagePath | null)` — `canManageProperty()` gate, verify the path belongs to one of this property's photos (or is null), write `hero_image_path`, `recordRevision`, `revalidatePath`.
- Detail page (`src/app/(app)/properties/[slug]/page.tsx`): select `hero_image_path`, resolve hero with the fallback semantics above, keep `restPhotos` = everything else.
- Gallery + hero controls: "Make This the Hero" (admins, non-hero photos), "Hero" marker + "Use Newest Photo" clear (admins, current hero). Title Case, ≥40px targets, no icon circles.
- `deletePhoto`: null `hero_image_path` when deleting the current hero.
- Delete-photo copy: make it true in both worlds ("The newest remaining photo will take its place." when no explicit hero / when deleting the hero; unchanged meaning otherwise).

## Out of scope

- Photo reordering / drag-sort of the gallery (different feature; the ask was hero only).
- Cropping, focal-point selection, or a separate hero upload slot.
- Any schema change (the column exists; the guard exists — verify, don't add).
- Surfacing the control to non-admin members (writes would bounce off the DB trigger anyway; don't render a button that fails).

## Verification recipe

1. **Set** — as a property admin, pick a non-newest photo → detail hero and listing card both show it; a subsequent new upload does **not** displace it; revision row recorded.
2. **Clear** — "Use Newest Photo" → back to newest-photo behavior; revision recorded.
3. **Delete the hero** — remove the chosen hero photo → `hero_image_path` nulled, page falls back to newest, no broken image.
4. **Dangling path** — with `hero_image_path` pointing at a nonexistent path (set via SQL in a dev DB), the page renders newest-photo fallback, no error.
5. **Non-admin member** — sees no hero controls; direct action call rejected by `canManageProperty()` (and the DB trigger behind it).
6. **Guest** — page unchanged for them; no controls (guests already can't reach edit surfaces).
7. `tsc` / `eslint` / `build` green.

## Likely file layout

```
src/app/(app)/properties/[slug]/page.tsx          # honor hero_image_path + fallback; hero controls
src/app/(app)/properties/[slug]/actions.ts        # setHeroPhoto; deletePhoto nulls dangling hero
src/app/(app)/properties/[slug]/property-gallery.tsx  # per-photo Make This the Hero
src/lib/properties.ts                             # (read path already correct — reuse, don't fork)
```

No migration. Confirm at build time that the PRD-27 trigger covers `hero_image_path`; if it somehow doesn't, one additive migration extends the guard.

## Reviewer sign-off (I check these)

- [ ] Writes go through `canManageProperty()` **and** land inside the existing DB column guard; non-admin members and guests can't set a hero from any path.
- [ ] `setHeroPhoto` validates the path belongs to the property (no writing arbitrary storage paths into the column).
- [ ] Fallback semantics: no explicit hero → identical to today's behavior; dangling path → newest photo, never a broken image.
- [ ] Deleting the hero clears the column in the same action; delete copy is truthful in both modes.
- [ ] `recordRevision` on set and clear.
- [ ] Controls follow house restraint (Title Case, ≥40px, no candy pills); reversible via "Use Newest Photo".
- [ ] Live walk on prod: set Loon-A-See's hero to the photo Dad prefers, confirm listing + detail agree, upload-doesn't-displace confirmed.
