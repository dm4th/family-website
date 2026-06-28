# 03 — Properties (Wiki-style)

**Phase**: 1 (first slice) · **Chunk**: 5 · **Depends on**: 2 (auth), 3 (DB schema)
**Status**: ✅ Shipped (2026-05-23). See **Implementation** at the bottom.

## Goal

A page per family property that holds everything a family member needs to know about the place — photos, address, house rules, "how things work here" (trash schedule, wifi, quirks), and a contact list ("who do I call if the water heater dies?"). Any member can edit; every save is logged.

Seeded properties (after migration `20260523000004`):
- **Loon-A-See** (`loon-a-see`) — Squam Lake, New Hampshire
- **Loon-E-Bin** (`loon-e-bin`) — Squam Lake, New Hampshire
- **Moosedraw** (`moosedraw`) — Big Sky, Montana _(renamed from "Mumford's Motel" / `mumfords-motel` via migration `20260624000004`)_

## User stories

- As a member planning a stay at Loon Lake, I open `/properties/loon-lake` and see hero photo, address, gallery, house rules, how-to, contacts.
- As anyone who notices the wifi password changed, I hit "Edit" and update the how-to in 30 seconds.
- As the de facto caretaker, I add a "Plumber — Mike — (555) 1234" entry to the contacts list.
- As an admin worried someone deleted important info, I can see the `revisions` table and roll back a field.
- As any member at the cabin with a phone, I upload three photos from this weekend into the property gallery.

## In scope

- `/properties` — grid of active properties, hero image + name
- `/properties/[slug]` — full detail page rendering `name`, `location`, `address`, `description` (Markdown), `how_to` (Markdown), `guidelines` (Markdown), `amenities` (chip list), `property_contacts` (table-ish), gallery from `photos` table
- `/properties/[slug]/edit` — form with all editable fields. Any logged-in member can submit. Server Action diffs old vs. new field-by-field and writes a `revisions` row.
- Gallery component with lightbox; reuses photo upload from `02-family-directory.md`
- Contacts subsection: add / edit / reorder / delete rows of `property_contacts`
- Seed migration: Loon Lake + Loon Cabin with placeholder content

## Out of scope (for first slice)

- Booking calendar (Phase 2 — see `06-property-booking.md`)
- Per-property access control (some properties hidden from some branches) — currently all-visible
- Cost / expense tracking
- Maintenance work order tracking
- Map embed for the address

## Open questions

- Markdown editor vs. plain textarea? Recommendation: plain textarea + light Markdown rendering for first slice. Promote to a real editor (TipTap) only if needed.
- Revisions: show diff history in-app, or just store for audit? Recommendation: store now, build a viewer later only if someone asks.
- Are Loon Lake and Loon Cabin one property or two? Need to confirm with Dan's dad — for now, **modeling as two** with shared seed data; easy to merge.

## References / reuse

- Photo upload component from `02-family-directory.md`
- Revisions audit pattern: any editable entity (property, profile, contact) writes to the `revisions` table via a small `recordRevision()` helper

## Implementation

**Key files**
- [src/app/(app)/properties/page.tsx](../src/app/(app)/properties/page.tsx) — listing grid with hero image, name, location, status badge
- [src/app/(app)/properties/[slug]/page.tsx](../src/app/(app)/properties/[slug]/page.tsx) — detail page: about / how-to / house rules (all Markdown), amenities chips, contacts list, photo gallery, upload zone
- [src/app/(app)/properties/[slug]/property-gallery.tsx](../src/app/(app)/properties/[slug]/property-gallery.tsx) — Client gallery (no avatar promote — that lives only on profiles)
- [src/app/(app)/properties/[slug]/actions.ts](../src/app/(app)/properties/[slug]/actions.ts) — `updateProperty` (writes diff to `revisions`)
- [src/app/(app)/properties/[slug]/edit/page.tsx](../src/app/(app)/properties/[slug]/edit/page.tsx) — edit page wiring
- [src/app/(app)/properties/[slug]/edit/property-edit-form.tsx](../src/app/(app)/properties/[slug]/edit/property-edit-form.tsx) — wiki form (name, location, address, description, how_to, guidelines, amenities, status [admin-only])
- [src/app/(app)/properties/[slug]/edit/contacts-editor.tsx](../src/app/(app)/properties/[slug]/edit/contacts-editor.tsx) — inline CRUD: one form per existing contact + an "Add contact" form
- [src/app/(app)/properties/[slug]/contacts/actions.ts](../src/app/(app)/properties/[slug]/contacts/actions.ts) — `addPropertyContact`, `updatePropertyContact`, `deletePropertyContact` (each records a `revisions` row)

**Shared infrastructure (new in chunk 5)**
- [src/lib/properties.ts](../src/lib/properties.ts) — `loadPropertyCards()` with hero fallback to most-recent uploaded photo per property
- [src/lib/revisions.ts](../src/lib/revisions.ts) — `diffRecords()` shallow diff + `recordRevision()` (best-effort; audit failures don't roll back the main write)
- [src/components/markdown.tsx](../src/components/markdown.tsx) — `react-markdown` + `remark-gfm`, no raw HTML passthrough
- `@tailwindcss/typography` plugin added via `@plugin` in [globals.css](../src/app/globals.css) so `prose` classes work
- `is_admin()` exposed as a Postgres function and called from server actions via `supabase.rpc("is_admin")` to gate the `status` field

**Decisions made during build**
- **Markdown editor**: plain textarea + live render on the detail page. No TipTap / WYSIWYG until someone asks.
- **Status field**: site admin OR property admin. Members can edit every other field. Enforced at the action layer (centralized in `canManageProperty()` — see `src/lib/property-auth.ts`).
- **Two-tier admin model** (added 2026-05-23): site admins (`profiles.role='admin'`) control roster + property creation; property admins (`property_admins` join table) control per-property status, hero image, and other property-scoped admin ops. See migration `20260523000006_property_admins.sql` for the schema + `is_property_admin(uuid)` helper. UI for managing property admins lives on `/properties/[slug]/edit` and is visible only to site admins or existing property admins for that property.
- **Hero image fallback**: when `hero_image_path` is unset, the listing card uses the property's most-recently-uploaded photo. Avoids empty cards before anyone explicitly picks a hero.
- **Revisions are best-effort**: if the audit-log INSERT fails, we log and continue. The user's edit still succeeds. Keeps the UX from breaking on transient audit issues.
- **Contacts ordering**: `sort_order` set to max + 10 on insert. No reordering UI yet (drag-handle could come later).
- **Photo display**: same `<img>` + signed URL pattern as profiles (no `next/image` yet).

**Open follow-ups (not blocking)**
- Slug editing (admin-only, behind a confirm — currently not editable from this UI; SQL only)
- Photo "set as hero" button on property gallery
- Contact reordering UI (drag handle)
- Markdown preview in the edit textarea
- Surface `revisions` history in-app (it's currently logged but never displayed)
