# 11 — Family Legacy (Archive · Tree · Timeline · Stories)

**Phase**: 4 · **Depends on**: 02 (members/profiles exist), 05 (photo upload + storage), **12 (authoring UX — Legacy is all content authoring; build the shared editor layer first)**
**Status**: 🟢 ready — scoping agreed. Build as a sequence of small slices (see [Sequencing](#sequencing)). This is the umbrella plan; each slice is its own session/branch.

> **Supersedes [10-family-timeline.md](10-family-timeline.md)** — the timeline is now one slice *inside* Legacy, not a standalone feature. PRD 10 is retained for its detailed timeline schema/UX notes; this file is the parent.

---

## Decision: Legacy lives **inside the Family zone** — it is not a new top-level zone

Dan's dad wants the family-legacy side (historical photos, a family tree, the timeline, recorded stories) to be a prominent, first-class part of the site. We considered making it a fourth emotional zone alongside Family / Operations / Advisory, but decided against it:

- **No new design-system surgery.** Legacy reuses the existing **Family mode** — burgundy accent, `SalonPanel`, Fraunces hero titles, generous whitespace, image-led. No fourth accent color, no new shell primitive.
- **It belongs with Family conceptually.** Profiles, photos, stories, and the tree are all "the people." Legacy is the deep, multi-generational layer of the same Family zone.
- **Prominence comes from placement, not a new tab.** The Family group in the nav grows from one link (Directory) to a small set (Directory, Legacy hub, and its pages), and the homepage Family gateway leads with Legacy.

So everything below is **Family mode**. Read the `family-office-ui` and `page-mode-orchestrator` skills before building any of it; classify each page as Family.

## Onboarding (read first if you're picking this up cold)

1. **Read** [CLAUDE.md](../CLAUDE.md), [prds/00-master-plan.md](00-master-plan.md), then this file, then [10-family-timeline.md](10-family-timeline.md) for the timeline slice's deeper notes.
2. **You will reuse heavily** (don't reinvent — see master plan "Foundation that's already built"):
   - `photos` + `photo_subjects` tables — extend, don't replace
   - `PhotoUpload` (`src/components/photo-upload.tsx`) — direct-to-Storage upload; add an "archival" attachment kind
   - `withSignedUrls()` (`src/lib/photos.ts`) for batch-signing
   - `recordRevision()` (`src/lib/revisions.ts`) for wiki-style edit history on albums/people/events/stories
   - `Markdown` component for long-form text (album/person/event/story bodies)
   - `ProfileAvatar` for rendering people
   - The Server-Component-read / Server-Action-write / `revalidatePath()` pattern (template: `src/app/(app)/properties/[slug]/actions.ts`)
3. **Skills**: `.agents/skills/supabase` (RLS) and `supabase-postgres-best-practices` (indexing for date-range and graph queries). For the tree visualization, optionally `d3-hierarchy` or a lighter tree lib — but start with structured HTML, not a viz library.
4. **Privacy**: same model as the rest of the site — open to all authenticated family members, RLS on every table. Do not gate by branch unless someone explicitly asks.

## Goal

Preserve and surface family history — old photographs, who's related to whom across the generations, the chronology of the family, and the stories of the people in it. The thing the next generation will care most about in 20 years. Make it feel reverent and editorial, not like a database.

## The keystone decision: a `people` table

The single most important architectural call here. Today, every photo subject and every site account is a `profiles` row — i.e. a **living family member with a login**. Legacy needs to attach photos, relationships, events, and stories to people who will **never log in**: great-grandparents, the older sister who has passed, ancestors going back generations.

**Recommendation: introduce a `people` table early** (as part of, or just before, the Photo Archive slice) as the shared backbone for all four sub-features.

- `people` = every human the family wants to record, living or not.
- A living member's `people` row links to their `profiles` row (`people.profile_id` nullable FK); ancestors have `profile_id = null`.
- Photo tags, tree edges, event subjects, and story subjects all reference `people`, not `profiles`.
- This avoids a painful retrofit: if the Photo Archive ships with free-text subject names, every later slice has to migrate those strings into real entities.

| Decision | Recommendation | Why |
|---|---|---|
| **Tag ancestors via…** | A real `people` table from the start | Free-text names don't connect to the tree, the timeline, or stories. Bite the bullet once. |
| **Living member ↔ person** | `people.profile_id` nullable FK to `profiles` | One person, one row; the login is an attribute, not the identity. |
| **Backfill** | Seed a `people` row per existing `profiles` row in the Archive migration | Keeps existing photo subjects working and gives the tree its living nodes for free. |

If a contributor decides to defer `people` and ship Archive v1 with free-text names, that is allowed but **must** be flagged loudly in the migration and this PRD — it creates migration debt for slices 2–4.

## Sub-features (in agreed priority order)

### 1 · Photo Archive  ← build first

**Problem.** Photos today must attach to a living person's profile or a property. There is no home for a 1960s photo of grandparents at Squam, no concept of an album, no way to date a scan or tag someone who isn't a member.

**In scope**
- `albums` table: `id`, `title`, `description` (Markdown), `cover_photo_id` (nullable), `era` (text, e.g. "1960s–1970s"), `created_by/at`, `updated_by/at`.
- `album_photos` (many-to-many): `album_id` + `photo_id` + optional `sort_order`.
- Extend `photos`: `taken_on date null` (exact date when known) + `circa text null` (fuzzy: "circa 1972", "summer 1968") + `is_archival boolean default false`.
- Extend subject tagging to reference `people` (see keystone) so ancestors can be tagged.
- Add an **"archival" attachment kind** to `PhotoUpload` so a scan can be uploaded straight into an album without attaching to a living profile/property.
- Routes (all Family mode): `/family/archive` (album grid), `/family/archive/[albumId]` (album view + lightbox), album create/edit, photo dating + people-tagging UI.

**Out of scope (initial)**: video, AI auto-tagging, face recognition, external genealogy import.

### 2 · Family Tree

**In scope**
- `people` table (if not already created in slice 1 — see keystone): `id`, `display_name`, `given_name`, `family_name`, `birth_date`/`birth_circa`, `death_date` (nullable — drives "in memoriam"), `family_branch`, `bio` (Markdown), `photo_id` (nullable), `profile_id` (nullable FK), audit columns.
- `relationships` (graph edges): `id`, `person_a`, `person_b`, `type` (`parent`/`spouse`), plus enough to render parent-child and marriage links.
- A tree/structured view at `/family/tree`; a person detail at `/family/tree/[personId]` (bio, their photos from the archive, their place in the tree, their stories).
- **In-memoriam treatment** for deceased people (the older sister especially) — reverent, not a gray-out. Agree tone/wording with Dan + dad before shipping.

**Pre-flight**: start with a simple structured layout (HTML/CSS columns by generation). Only reach for `d3-hierarchy` once that genuinely breaks. ~23 living + a few dozen ancestors does not need a heavy viz library.

### 3 · Timeline  → see [10-family-timeline.md](10-family-timeline.md)

The chronological spine. Now stronger because photos carry `taken_on`/`circa` and people are real entities. Reuse PRD 10's `events` / `event_subjects` / `event_photos` design, but point subjects at `people` and pull photos from albums. Route under Family mode: `/family/timeline`.

### 4 · Stories & Remembrances

**In scope**
- `stories` table: `id`, `title`, `body` (Markdown), `author` (the `people`/`profiles` row who recorded it), `subjects` (many-to-many to `people`), optional links to an album/event, audit columns.
- A simple "record a memory" form (text first) at `/family/stories`; stories surface on the relevant person, album, and timeline event.
- **Later (explicitly deferred)**: audio recording + transcription. Emotionally the highest-value capture for the eldest generation, but text-first proves the surface; layer audio on once it's used.

## Navigation & homepage placement

- **Nav (`src/components/app-shell/site-nav.tsx`)** — the existing **Family** group gains a `Legacy` link (hub at `/family/legacy` or directly the Archive once it's the only piece). As slices land, add Archive / Tree / Timeline / Stories under the same Family group. No new top-level group, no new mode color.
- **Homepage (`src/app/(app)/page.tsx`)** — the Family gateway leads with Legacy (e.g. retitle/extend the Family gateway, or add a second Family-mode gateway for "The Archive"). Consider a featured historical photo once the archive has content. Keep it editorial — one dominant moment, not a card wall.

## Sequencing

Build as four independent slices, in this order, each its own session/branch:

1. **Photo Archive** (+ the `people` keystone table and profile→person backfill). Biggest emotional payoff; establishes the backbone.
2. **Family Tree** — builds on `people`; adds relationships + the tree view + in-memoriam.
3. **Timeline** — per PRD 10, now wired to `people` + albums.
4. **Stories** — text-first; hangs off people/events/albums.

Each slice should: branch, ship, fill in its Implementation section, and flip status in this file + the master-plan active queue.

## Cross-cutting decisions

| Decision | Recommendation | Why |
|---|---|---|
| **Privacy** | Same RLS as `photos` — all authenticated family members see everything | Don't gate by branch unless asked. |
| **Editing** | Wiki-style: any member can add/edit albums, people, events, stories; `recordRevision()` logs it | Matches the rest of the site; avoids a single maintainer. |
| **Deceased members** | First-class with reverent "in memoriam" treatment | The older sister's memory deserves a place; agree tone with the family. |
| **Fuzzy dates** | `taken_on date` *and* `circa text` | Most old photos have no exact date. |
| **Audio stories** | Deferred behind text | Needs transcription + storage; prove the text surface first. |

## Verification recipe (per slice)

- **Archive**: upload a historical scan into a new album → set `circa "1968"` → tag an ancestor (`people` row with no login) → album view renders it; subject links to the person.
- **Tree**: add an ancestor + a parent/spouse edge → `/family/tree` renders the relationship; a deceased person shows in-memoriam treatment; their archive photos appear on their person page.
- **Timeline**: see PRD 10's recipe; confirm subjects resolve to `people` and photos pull from albums.
- **Stories**: record a memory tagged to two people → it appears on both person pages and any linked event.
- **RLS (every slice)**: hit the API unauthenticated → nothing leaks. Edit someone else's album/person/story → `revisions` row recorded.

## References / reuse

- `photos` / `photo_subjects` (extend), `PhotoUpload`, `withSignedUrls()`, `recordRevision()`, `Markdown`, `ProfileAvatar`
- Wiki-edit + revisions template: `src/app/(app)/properties/[slug]/actions.ts`
- Family-mode visual rules: `.claude/skills/family-office-ui/SKILL.md` + `SalonPanel` in `src/components/shell/`
- Timeline specifics: [10-family-timeline.md](10-family-timeline.md)

## Implementation

_Filled in per slice as each ships._

- **Slice 1 — Photo Archive + `people` keystone**: _status: not started — **but the `people` table itself landed early** via PRD 12 slice 3 (PeoplePicker needed a real backing store)._
  - **`people` table is already created**: `supabase/migrations/20260624000001_people.sql` + Drizzle mirror in `src/lib/db/schema.ts`. It implements this PRD's keystone column set (`display_name`, `given_name`/`family_name`, `birth_date`/`birth_circa`, `death_date`/`death_circa`, `family_branch`, `bio`, nullable `photo_id` + `profile_id` FKs, audit cols), the unique-per-living-member partial index on `profile_id`, wiki RLS (authenticated read + insert/update, admin-only delete), and the **profile→person backfill**. **Applied to prod** and seeded from Dan's initial CSV (`20260624000002_people_seed.sql`) — 8 people live (members linked, ancestors `profile_id` null). Note: one existing profile (`pfmathieson@gmail.com`) has no `full_name`, so its backfilled person shows the email as `display_name` until enriched.
  - **What's left for this slice**: `albums` / `album_photos`, the `photos` extensions (`taken_on` / `circa` / `is_archival`), the "archival" `PhotoUpload` kind, subject-tagging wired to `people` (use the `PeoplePicker` from PRD 12), and the `/family/archive` routes. The keystone dependency is done.
- **Slice 2 — Family Tree**: _status: not started_
- **Slice 3 — Timeline**: _status: not started (see PRD 10)_
- **Slice 4 — Stories**: _status: not started_
