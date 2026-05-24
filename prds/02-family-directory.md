# 02 — Family Directory & Profile Pages

**Phase**: 1 (first slice) · **Chunk**: 4 · **Depends on**: 2 (auth), 3 (DB schema)
**Status**: ✅ Shipped (2026-05-23). See **Implementation** at the bottom.

## Goal

Give the family a "who's who" — a directory of all members with photos, branches, and short bios. Each profile has a photo collection that *anyone* can contribute to. The profile owner controls their avatar, name, bio, phone.

## User stories

- As a great-grandchild's parent, I open `/family` and see everyone with photos, grouped or sortable by branch.
- As a grandchild, I tap a name and see their profile with photos, bio, contact info.
- As any member, I drop a photo from a recent gathering onto Aunt's profile page — it appears with my name as uploader.
- As a profile owner, I scroll my photo collection and pick a new avatar.
- As a profile owner, I edit my own name, avatar, bio, phone, family-branch, generation.

## In scope

- `/family` — responsive grid of all profiles. Filter / group toggle by `family_branch` and `generation`. Spouses appear inline as regular members.
- `/family/[id]` — profile detail page: avatar (large), full name, family branch, relationship notes, bio, phone, photo collection grid
- `/profile/edit` — own-profile editor (Server Action submit, optimistic UI optional)
- Photo upload component (also used by property pages) — drag-drop + mobile camera. Uploads to Supabase Storage; creates `photos` row with `uploaded_by`; optionally links to one or more `photo_subjects`.
- "Set as my avatar" button on any photo where you're a subject (or it's on your profile)

## Out of scope (for first slice)

- Family tree visualization
- Inline messaging / chat
- Birthday / anniversary tracking
- Photo comments / reactions
- Photo deletion by uploader (later — needs moderation thinking)

## Open questions

- How do we represent "spouse of X"? Free-text `relationship_notes` for first slice. Promote to a `family_relationships` graph table later if it gets messy.
- Should photo subject tagging be optional or required? Recommendation: optional, with a "Tag people" affordance after upload.
- Privacy: should phone numbers be visible to everyone, or hidden behind a "Show contact" toggle? Recommendation: visible to all logged-in family members; not searchable / not on the public web.

## References / reuse

- Same photo upload component as `03-properties.md` — design it once, use it in both places.

## Implementation

**Key files**
- [src/app/(app)/family/page.tsx](../src/app/(app)/family/page.tsx) — directory grouped by generation (Gen 1, 2, 3 sections + an "unknown" bucket for profiles missing `generation`). Avatars batch-signed in one round-trip.
- [src/app/(app)/family/[id]/page.tsx](../src/app/(app)/family/[id]/page.tsx) — detail page; pulls the photo collection via `photo_subjects` join
- [src/app/(app)/family/[id]/photo-gallery.tsx](../src/app/(app)/family/[id]/photo-gallery.tsx) — Client Component for the gallery + "Use as my avatar" button
- [src/app/(app)/profile/edit/page.tsx](../src/app/(app)/profile/edit/page.tsx) + [profile-edit-form.tsx](../src/app/(app)/profile/edit/profile-edit-form.tsx) — own-profile editor
- [src/app/(app)/profile/actions.ts](../src/app/(app)/profile/actions.ts) — `updateOwnProfile`, `setAvatarFromPhoto`
- [src/app/(app)/photos/actions.ts](../src/app/(app)/photos/actions.ts) — `uploadPhoto` (storage + DB row + `photo_subjects` tags, with rollback on partial failure), `deletePhoto`

**Shared components (reused by chunk 5)**
- [src/components/photo-upload.tsx](../src/components/photo-upload.tsx) — drag-drop + mobile-camera, multi-file sequential, attaches by `{ kind: "profile" | "property"; id }`
- [src/components/profile-avatar.tsx](../src/components/profile-avatar.tsx) — four sizes, initials fallback
- [src/lib/photos.ts](../src/lib/photos.ts) — MIME validation, 25MB cap, partitioned paths, `withSignedUrls()` batch helper (1h TTL)
- [src/lib/avatars.ts](../src/lib/avatars.ts) — resolves `profiles.avatar_url` (http URL or storage path) into a renderable URL

**Decisions made during build**
- **Grouping**: built the by-generation section grouping instead of the "filter / group toggle" the PRD mentioned — 23 people is too few to need a toggle, and grouping is more scannable. Toggle can be added later if the family grows.
- **Photo tagging**: optional. Photos uploaded to a profile page auto-tag the profile owner; additional subjects can be tagged via `tagSubjectIds` (UI for that is not built yet — chunk 5 polish).
- **Phone visibility**: visible to all signed-in members. Not hidden behind a toggle.
- **Storage bucket**: private `photos` bucket created in [supabase/migrations/20260523000005_photos_storage.sql](../supabase/migrations/20260523000005_photos_storage.sql) with RLS aligned to the `photos` table.
- **Display**: using plain `<img>` (not `next/image`) for now — signed Supabase URLs change per request and next/image's CDN cache would be churn-y. Revisit if performance suffers.

**Open follow-ups (not blocking)**
- Photo subject tagging UI (currently auto-tags the profile being uploaded to)
- Photo deletion UI (server action exists; no button yet)
- Filter / group toggle if the family roster outgrows simple sectioning
