# 10 — Family Timeline & History

**Phase**: 4 · **Depends on**: photo collection has reached critical mass
**Status**: ✅ shipped as [11 — Family Legacy](11-family-legacy.md) slice 3 (2026-06-30). This file is retained for its detailed timeline schema and UX notes; the authoritative build record is PRD 11's slice-3 Implementation section. Subjects reference the `people` backbone (not `profiles`) via `event_people`.

## Onboarding (read first if you're picking this up cold)

1. **Read** [CLAUDE.md](../CLAUDE.md), [prds/00-master-plan.md](00-master-plan.md), then this file.
2. **Sanity check the "hold" status** — `select count(*) from photos` and check usage. If the collection is still small, the timeline will feel empty regardless of how nicely it's built.
3. **You will reuse heavily**:
   - `photos` + `photo_subjects` tables exactly as-is
   - `withSignedUrls()` from `src/lib/photos.ts`
   - `recordRevision()` for editable events (wiki-style, same as properties)
   - The Markdown component for story text
   - `ProfileAvatar` to render people in events
4. **Skills**: standard Next.js + Supabase patterns. If you're adding the family-tree visualization, optional: `d3` or a lighter tree-rendering lib.

## Goal

Preserve family history — stories, milestones, the older generation's memories — in a structured, browsable timeline. The "legacy" feature: the thing the next generation will care most about in 20 years.

## User stories

- As a grandchild curious about family history, I scroll a timeline showing family events back through the decades with photos.
- As a member of the eldest generation, I record (or have a relative record) a short story about a memory; it's tied to a date and the people involved.
- As any member, I tag photos with the year and the people in them; the timeline assembles automatically.
- As an admin, I curate a "best of" or themed view (e.g., "Loon Lake summers" or "Wedding photos").

## Pre-flight decisions (decide before code)

| Decision | Recommendation | Why |
|---|---|---|
| **Story format** | Text-only at first | Audio is high-leverage but needs transcription + storage. Layer it on once text is proven. |
| **Family-tree visualization** | Defer — wait until current model breaks | `family_branch` + `relationship_notes` works for ~23 people. Add a `family_relationships` graph table only when needed. |
| **Deceased family members** | Include with explicit "in memoriam" treatment | The older sister's memory deserves a place. Have the conversation with Dan + dad about tone/wording. |
| **Auto-assembly vs. manual events** | Both: auto-grouping by year from `photos.taken_at`; explicit `events` rows for milestones | Photos drive density; events provide narrative anchors. |
| **Privacy** | Same RLS as `photos` — all family members see everything | Don't try to gate by branch unless someone asks. |
| **Themed views** | Tag-based: add `tags text[]` to events; admins curate via tags | Lighter weight than dedicated "collection" tables. |

## In scope (candidates)

- `events` table: `id`, `title`, `description` (Markdown), `event_date`, `event_date_end` (nullable, for date ranges), `location`, `tags text[]`, `created_by`, `created_at`, `updated_at`, `updated_by`
- `event_subjects` (many-to-many) — `event_id` + `profile_id`, parallel to `photo_subjects`
- `event_photos` (many-to-many) — `event_id` + `photo_id`, link curated photos to events
- `/timeline` — vertical chronological scroll, auto-grouped by year, photos + events interleaved
- `/timeline/[year]` — single-year deep view
- `/timeline/themes/[tag]` — curated themed view
- Photo-tagging UI for `taken_at` + subjects (currently only auto-tagged for profile uploads; explicit UI here)
- Story-recording UI: simple form for an event + Markdown body
- Wiki-style editing on events (any member can edit; revisions logged via `recordRevision`)

## Out of scope (initial)

- Video uploads (storage cost; revisit when there's demand)
- Audio recording / transcription
- AI-generated "memory of the day" prompts
- Genealogy import from Ancestry / FamilySearch
- Public sharing of the family tree externally
- Privacy gating per event (open by default)

## Likely file layout

```
supabase/migrations/
  YYYYMMDD_timeline.sql            # events, event_subjects, event_photos, RLS
src/lib/db/schema.ts               # mirror

src/lib/timeline.ts                # loadTimelineByYear(), groupPhotosByYear()

src/app/(app)/timeline/
  page.tsx                         # main chronological scroll
  [year]/page.tsx                  # year-deep view
  themes/[tag]/page.tsx            # themed view
  events/
    new/page.tsx                   # create event
    [id]/edit/page.tsx             # edit event
  actions.ts                       # createEvent, updateEvent, deleteEvent, tagPhoto
```

## Verification recipe

1. Open `/timeline` → see most recent year at top, scroll back. Photos render with year headers.
2. Click a photo without a `taken_at` → tag year + subjects → photo moves to the correct year section.
3. Create an event ("Christmas 1998" with description + linked photos + tagged people) → appears in the 1998 section with the photos inline.
4. Edit a sibling's event → `revisions` row recorded.
5. Admin tags a few events with `loon-summers` → `/timeline/themes/loon-summers` renders just those events.
6. RLS check — open the API directly without auth; verify nothing leaks.

## References / reuse

- Same `photos` / `photo_subjects` tables from Phase 1 — extending, not replacing
- Same wiki-edit + revisions pattern as properties (see `src/app/(app)/properties/[slug]/actions.ts` for the template)
- `ProfileAvatar` for rendering subjects on events
- For year-grouping logic: pure date-fns; no new dependencies

## Implementation

Shipped as **PRD 11 slice 3** (2026-06-30, branch `claude/timeline-slice3`). See PRD 11's slice-3 Implementation section for the authoritative record; summary here.

- **Status**: ✅ shipped (migration not yet applied to prod — see PRD 11).
- **Key files**: `supabase/migrations/20260630000003_timeline.sql` (`events`/`event_people`/`event_photos`); `src/lib/timeline.ts` (pure grouping/decade/year helpers); `src/app/(app)/family/timeline/` (`page.tsx` load+assembly, `timeline-view.tsx` jump rail + filter, `event-create.tsx`, `actions.ts`, `events/[eventId]/` detail + edit + photo linker + delete).
- **Decisions made during build**:
  - **Subjects point at `people`, not `profiles`** (`event_people`), mirroring slice-1 `photo_people`, so ancestors can be event subjects and the person/branch filter spans everyone.
  - **`event_year` is a stored canonical grouping year** (always set, derived from the exact date or a year parsed from the circa phrase) so grouping/sorting never parses fuzzy text.
  - **Auto-assembly** from dated `is_archival` photos (by `taken_on`/`circa` year), interleaved with explicit events; photos curated onto an event are excluded from the standalone stream. Satisfies "pull photos from albums" without a heavyweight picker.
  - **Traversability** (the slice-3 requirements-lock beyond PRD 10's scroll): a decade/year jump rail + client-side filter by family branch or a single person.
  - Newest-year-first ordering per this PRD's verification recipe.
- **Open follow-ups**: themed views (`/timeline/themes/[tag]` — `events.tags` column exists, no UI yet); date ranges (`event_date_end`) deferred; audio stories still deferred (slice 4 is text-first).
