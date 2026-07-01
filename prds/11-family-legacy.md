# 11 — Family Legacy (Archive · Tree · Timeline · Stories)

**Phase**: 4 · **Depends on**: 02 (members/profiles exist), 05 (photo upload + storage), **12 (authoring UX — Legacy is all content authoring; build the shared editor layer first)**
**Status**: 🚧 in progress — **all four slices built 2026-06-30**: slices 1 (Photo Archive), 2 (Family Tree) & 3 (Timeline) ✅ shipped to prod; **slice 4 (Stories) built + PR'd, prod-apply pending**. Legacy is feature-complete once slice 4 merges + its migration is applied. Requirements locked 2026-06-30 (see the requirements-lock callouts in slices 2 & 3). Built as a sequence of small slices (see [Sequencing](#sequencing)), each its own branch/PR.

> **Requirements lock (2026-06-30) — Dan confirmed this is his dad's headline interest.** Three things this build must deliver, folded into the slices below:
> 1. **A genuinely traversable family tree** (recenter / expand-collapse / pan-zoom — a viz layout, not a static wall chart) — slice 2.
> 2. **A traversable timeline** (scroll + decade jump rail + filter by person/branch) — slice 3.
> 3. **Add family-tree branches without creating website accounts** — already handled by the `people` keystone (`profile_id` nullable); slice 2 adds the person-create UI that exploits it.
> Any member can add/edit all of it (wiki RLS, already the model). **Sequencing stays Archive-first** (decided 2026-06-30) so the tree and timeline launch with real photos attached rather than as empty scaffolds — dad's priority ships 2nd, not last.

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
- Extend subject tagging to reference `people` (see keystone) so ancestors can be tagged. **Migration decision (must be made in this slice):** `photo_subjects` today keys on `profile_id` → `profiles`, so it can only tag living members. Ancestors have no `profiles` row. **Add a new `photo_people` join table** (`photo_id` + `person_id`, wiki RLS) rather than repointing `photo_subjects` — that keeps the existing profile-tagging path (and its auto-tag on profile upload) untouched and additive, and lets a photo tag both members and ancestors. The person-tagging UI uses the existing **`PeoplePicker`** (`src/components/authoring/people-picker.tsx`, read-only typeahead already shipped in PRD 12). Do **not** migrate/drop `photo_subjects`.
- Add an **"archival" attachment kind** to `PhotoUpload` so a scan can be uploaded straight into an album without attaching to a living profile/property.
- Routes (all Family mode): `/family/archive` (album grid), `/family/archive/[albumId]` (album view + lightbox), album create/edit, photo dating + people-tagging UI.

**Out of scope (initial)**: video, AI auto-tagging, face recognition, external genealogy import.

### 2 · Family Tree

> **Requirements lock (2026-06-30, Dan + agreed):** this is the slice Dan's dad cares most about. Two asks are non-negotiable and override the older "keep it minimal" framing that was here before:
> 1. **The tree must be genuinely _traversable_, not a static wall chart.** Click any person to **recenter** the tree on them; **expand/collapse** branches; **pan/zoom** back through generations. A `d3-hierarchy` (or equivalent) layout is now in scope from the start — the earlier "start with HTML columns, only reach for a viz lib once it breaks" guidance is **superseded**.
> 2. **Adding a branch must NOT require creating a website account.** This is already handled by the `people` keystone (`profile_id` nullable) — the person-create UI below must let a member add a deceased great-grandparent as a pure `people` row with no invite, no login, no `profiles` row.

**In scope**
- `people` table — **already exists and is live** (see keystone / Implementation). No new table needed; this slice consumes it.
- **`relationships` (graph edges)** — new table: `id`, `person_a`, `person_b`, `type` (`parent` | `spouse`), audit columns, wiki RLS (same as `people`: authenticated insert/update, admin-only delete). `parent` is directional (`person_a` is parent of `person_b`); `spouse` is undirected (enforce a canonical ordering or a uniqueness constraint on the unordered pair to avoid dupes). Siblings/grandparents/cousins are **derived** from parent/spouse edges, not stored. Index both `person_a` and `person_b` for traversal queries.
- **Person create/edit UI** (does not exist yet — the shipped `PeoplePicker` only reads): a Family-mode form to add or edit a `people` row — name, given/family, birth/death (exact date **or** circa text), family branch, bio (Markdown), optional photo. **Adding an ancestor here creates NO account.** Linking a person to an existing member (`profile_id`) is a separate, optional, admin-ish action — default is an unlinked person.
- **Edge create/edit UI**: from a person's page, "add a parent", "add a child", "add a spouse" — each either picks an existing person (`PeoplePicker`) or creates a new one inline, then writes a `relationships` row.
- A **traversable tree view** at `/family/tree` (recenter/expand/collapse/pan-zoom per the requirements lock); a person detail at `/family/tree/[personId]` (bio, their archive photos, their place in the tree with clickable parents/spouse/children, their stories).
- **In-memoriam treatment** for deceased people (the older sister especially) — reverent, not a gray-out. Agree tone/wording with Dan + dad before shipping.

**⚠️ Attribution guardrail (applies to person create/edit AND edge create/edit).** `people` and `relationships` both have open wiki RLS with `with check (true)` and **no trigger** bumping audit columns. So every Server Action here MUST (a) set `created_by`/`updated_by` to `auth.uid()` and bump `updated_at`, and (b) call `recordRevision({ entityType: "person" | "relationship", … })` — exactly like `updateProperty`. This is the primary thing reviewers check on these PRs.

**Pre-flight**: `d3-hierarchy` for layout math is fine; render to SVG/HTML with the Family-mode look (no default-library chrome — it must feel editorial, not like an org chart). ~23 living + a few dozen ancestors is small, so performance is a non-issue; the effort is entirely in the interaction + the reverent styling.

### 3 · Timeline  → see [10-family-timeline.md](10-family-timeline.md)

The chronological spine. Now stronger because photos carry `taken_on`/`circa` and people are real entities. Reuse PRD 10's `events` / `event_subjects` / `event_photos` design, but **point `event_subjects` at `people`** (mirror the slice-1 `photo_people` decision — a new `event_people` join keyed on `person_id`, not `profile_id`, so ancestors can be subjects) and pull photos from albums. Route under Family mode: `/family/timeline`.

> **Requirements lock (2026-06-30):** the timeline must also be **traversable**, not just a long scroll — this is part of what Dan's dad wants. Beyond PRD 10's vertical year scroll, add: (a) a **decade/year jump rail** to leap through a long history, and (b) **filter by person or family branch** (e.g. "show me just Peggy's branch" / "just events with Grandpa in them"). PRD 10's "vertical chronological scroll" is the baseline; jump + filter are now in scope for this slice, not a follow-up.

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

1. ✅ **Photo Archive** (+ the `people` keystone table and profile→person backfill) — shipped 2026-06-30. Biggest emotional payoff; establishes the backbone.
2. ✅ **Family Tree** — builds on `people`; adds relationships + the traversable tree view + in-memoriam. Shipped 2026-06-30.
3. ✅ **Timeline** — per PRD 10, wired to `people` + archive photos. Shipped 2026-06-30.
4. ✅ **Stories** — text-first; hangs off people/events/albums. Built 2026-06-30 (prod-apply pending).

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

- **Slice 1 — Photo Archive + `people` keystone**: ✅ **shipped** _(build session 2026-06-30; branch `claude/loving-turing-ce6e06`)_. The `people` keystone landed earlier via PRD 12 slice 3; this session built the archive on top of it.
  - **`people` table (keystone, prior work)**: `supabase/migrations/20260624000001_people.sql` + Drizzle mirror in `src/lib/db/schema.ts`. Implements the keystone column set, the unique-per-living-member partial index on `profile_id`, wiki RLS, and the profile→person backfill. **Applied to prod** and seeded (`20260624000002_people_seed.sql`, `20260624000003_peter_mathieson.sql`).
  - **New migration** `supabase/migrations/20260630000001_photo_archive.sql` — ✅ **applied to prod 2026-06-30** via `supabase db push` and schema-verified (all 3 tables with RLS on, the 3 `photos` columns, and all policies present). It adds:
    - `albums` (`title`, `description` Markdown, `era`, nullable `cover_photo_id`, audit cols) + `album_photos` (ordered M:N with `sort_order`).
    - **`photo_people`** — new join keyed on `person_id → people` (NOT `profile_id`), additive to `photo_subjects` per the slice decision, so a photo can tag both members and ancestors. `photo_subjects` is left untouched.
    - `photos` extensions: `taken_on date`, `circa text`, `is_archival boolean default false`.
    - RLS: family-only (`not is_guest()`) wiki posture on all three new tables (album delete narrowed to creator/admin; album_photos delete open for curation; photo_people delete uploader/admin). Archival photos carry `property_id = null` so the existing guest photos policy already hides them. **Added a scoped `photos` UPDATE policy** letting any non-guest member edit `is_archival` photos (caption/date), since the base photos-update policy is uploader-or-admin and the archive is wiki content.
  - **Keystone attribution guardrail honored**: `albums` has open family RLS with no audit trigger, so `createAlbum`/`updateAlbum` set `created_by`/`updated_by` + bump `updated_at` and call `recordRevision({ entityType: "album" })`; per-photo dating/tagging calls `recordRevision({ entityType: "photo" })`. `RevisionEntity` gained `"album"` + `"photo"` (in both `src/lib/db/schema.ts` and `src/lib/revisions.ts`).
  - **Upload path**: `PhotoUpload` + `recordUploadedPhoto` gained an `{ kind: "album"; albumId }` attachment that marks the photo `is_archival` and links it into `album_photos` (reuses the existing direct-to-Storage + thumb-companion pipeline; no new upload code).
  - **Routes** (all Family mode, `SalonPanel`/`PageIntro` editorial): `/family/archive` (album grid + `CreateFlow` "New Album") and `/family/archive/[albumId]` (in-place album header edit via `InlineEditable`, archival `PhotoUpload`, per-photo details sheet with `FuzzyDateField` + `PeoplePicker`, set-cover / remove-from-album, and a dependency-free lightbox). Actions in `src/app/(app)/family/archive/actions.ts`.
  - **Nav + homepage**: `Archive` link added to the Family nav group (`site-nav.tsx`; guests never render the nav); homepage Family gateway now **leads with "The Archive"** (`src/app/(app)/page.tsx`) with a live album count.
  - **Verified**: `tsc --noEmit`, `eslint`, and `next build` all clean. Migration applied to prod and **the relational flow was exercised on the live DB** (temporary round-trip, then cleaned up): album create + cover, an `is_archival` photo with `circa`, the album→photos join, **ancestor tagging via `photo_people` with `profile_id null`**, and an `album` revision all succeeded. Both routes boot under `next dev` and gate correctly (`307 → /login`). The only step not automatable here is the authenticated in-browser click-through (needs a family member login) — the data path beneath it is confirmed.
  - **Follow-ups**: (1) people chips on archive photos are plain text — they become links once slice 2 ships `/family/tree/[personId]`; (2) reuse `photo_people` for `event_people` in slice 3 (timeline); (3) Google-Photos import into an album is not wired (device upload only) — trivial to add via `AddPhotosModal` if wanted.
  - ⚠️ **Guardrail when you build the person create/edit UI** (PR #5 review finding): `people` has open wiki RLS — any authenticated member can INSERT/UPDATE any row (`with check (true)`) — and `created_by` / `updated_by` / `updated_at` are **not** enforced or auto-bumped by a trigger. So the Server Action behind person create/edit must (a) set `created_by` / `updated_by` to `auth.uid()` and bump `updated_at`, and (b) call `recordRevision({ entityType: "person", … })` — exactly like `updateProperty` — so edits stay attributable and reversible. (No person-edit UI ships yet; the `PeoplePicker` only reads, so this is a forward guardrail, not a current bug.)
- **Slice 2 — Family Tree**: ✅ **shipped** _(build session 2026-06-30; branch `claude/family-tree-slice2`)_. Consumes the existing `people` keystone; adds the graph, the authoring UI, and a genuinely traversable tree.
  - **New migration** `supabase/migrations/20260630000002_relationships.sql` — ✅ **applied to prod 2026-06-30** via `supabase db push` and verified on the live DB (table + RLS-on, all 4 policies, the no-self + spouse-canonical checks, the unique-edge index + both endpoint indexes; plus a full round-trip: 3 account-less ancestors, a two-parent edge set, a canonical spouse edge, and confirmation that duplicate/non-canonical/self edges are rejected and parent-derivation resolves — then cleaned up to 0 leftovers). Adds `relationships` (graph edges): `person_a`, `person_b`, `type` (`parent` | `spouse`), audit cols. `parent` is directional (a is parent of b); `spouse` is undirected and stored **canonically** (`person_a < person_b`, enforced by a check + sorted at write time) so unordered dupes can't exist. A `relationships_edge_key` unique index blocks duplicate edges; both endpoints are indexed (`person_a`/`person_b` + type) for traversal. Siblings/grandparents/cousins are **derived** from edges, never stored. RLS: family-only (`not is_guest()`) wiki insert/update, **admin-only delete** (an edge removal silently rewrites the tree). Drizzle mirror + `RelationshipType`/`Relationship` types in `src/lib/db/schema.ts`; `RevisionEntity` gained `"person"` + `"relationship"` (schema.ts + `src/lib/revisions.ts`).
  - **Attribution guardrail honored** (the reviewer check called out in this PRD): `people` and `relationships` both have open wiki RLS with no audit trigger, so every Server Action in `src/app/(app)/family/tree/actions.ts` sets `created_by`/`updated_by` (+ bumps `updated_at` on update) and calls `recordRevision({ entityType: "person" | "relationship" })`. Actions: `createPerson`, `updatePerson`, `addRelative` (parent/child/spouse — links an existing person **or** creates a new one inline, mapping the human relation onto a canonical edge; 23505 unique-violation is a no-op success), `removeRelationship` (admin).
  - **Add a branch without an account** (requirements-lock #3): `createPerson` / the inline "someone new" path in `addRelative` write a pure `people` row — no invite, no email, no `profiles` row. Living-member linking is left as the default-off, optional path (not surfaced yet — see follow-ups).
  - **Traversable tree** (requirements-lock #1): `src/app/(app)/family/tree/family-tree-view.tsx` is a dependency-free **ego-centric** SVG/HTML canvas — the focus person is centered with parents/grandparents above, children/grandchildren below, spouses/siblings on the focus row; **click anyone to recenter**, **drag to pan**, **zoom/reset** controls. Chosen over `d3-hierarchy` because a genealogy graph (marriages + multiple parents) isn't a clean single-root tree, and the authoring layer is deliberately dependency-free. Layout + relative-derivation live in the framework-free `src/lib/family-tree.ts` (`deriveRelatives`, `lifespan`, `isInMemoriam`, `isMember`), shared by the client view and the server person page.
  - **Routes** (Family mode): `/family/tree` (the canvas + "Add a Person"; opens centered on the viewer, or on `?focus=<id>`) and `/family/tree/[personId]` (in-place edit via `InlineEditable` + `PersonFields`, clickable parents/spouse/children/siblings, `AddRelative` controls, their archive photos via `photo_people`, and reverent **in-memoriam** treatment for the deceased — an "In memoriam" eyebrow + dagger, not a gray-out).
  - **Nav + homepage**: `Family Tree` link added to the Family nav group; homepage Family gateway gains a second Legacy block ("The Family Tree", live person count) alongside The Archive.
  - **Slice-1 follow-up closed**: archive-photo people chips (lightbox caption) now link to `/family/tree/[personId]`.
  - **Verified**: `tsc --noEmit`, `eslint`, and `next build` all clean; both new routes compile as dynamic server routes. Migration applied to prod and the relational flow exercised on the live DB (see the migration note above; temp rows cleaned up). The only step not automatable is the authenticated in-browser click-through (needs a family login) — the data path beneath it is confirmed.
  - **Follow-ups**: (1) tighten the pre-existing `people` SELECT policy (guest-readable — predates guest access; `relationships` already takes the stricter family-only posture); (2) optional admin UI to link an ancestor `people` row to a member `profiles` row (dedupe); (3) reuse `photo_people` as `event_people` for the timeline (slice 3).
- **Slice 3 — Timeline**: ✅ **shipped** _(build session 2026-06-30; branch `claude/timeline-slice3`)_. Detailed spec in [10-family-timeline.md](10-family-timeline.md); this is the parent record.
  - **New migration** `supabase/migrations/20260630000003_timeline.sql` — ✅ **applied to prod 2026-06-30** via `supabase db push` and verified on the live DB (all 3 tables with RLS on; events 4 / event_people 3 / event_photos 3 policies; the 4 expected indexes; `event_year` NOT NULL; plus a round-trip: an event with two `event_people` subjects and an `event_photos` link, grouping under 1998, then cleaned up via cascade to 0 leftovers). Adds `events` (`title`, Markdown `description`, `event_date` exact / `event_circa` fuzzy, **`event_year` canonical grouping year — always set**, `location`, `tags text[]` for future themed views, audit cols), `event_people` (subjects → **`people`**, not `profiles`, mirroring `photo_people` so ancestors can be subjects), and `event_photos` (curate archive scans onto an event, ordered M:N). Family-only wiki RLS; event delete narrowed to creator/admin, join deletes open for curation. Drizzle mirror (`events`/`eventPeople`/`eventPhotos` + types); `RevisionEntity` gained `"event"` (schema.ts + `src/lib/revisions.ts`).
  - **Attribution guardrail honored**: `createEvent`/`updateEvent` in `src/app/(app)/family/timeline/actions.ts` set `created_by`/`updated_by` (+ bump `updated_at`), sync `event_people`, and call `recordRevision({ entityType: "event" })`. Also `setEventPhoto` (link/unlink, 23505 = no-op) and `deleteEvent` (creator/admin via RLS).
  - **One stream, two sources** (requirements-lock: "pull photos from albums"): the timeline interleaves **events** with **dated archive photos** — any `is_archival` photo whose `taken_on`/`circa` yields a year auto-assembles into its year (no extra tagging), excluding photos already curated onto an event. Year derivation + grouping + decade-building live in the framework-free `src/lib/timeline.ts` (`parseYear`, `dateLabel`, `groupByYear`, `buildDecades`, `matchesFilter`).
  - **Traversable** (requirements-lock #2): beyond the newest-year-first scroll (`/family/timeline`), `TimelineView` adds a **decade/year jump rail** (smooth-scroll to any year) and **filter by family branch or a single person** (client-side, instant) — the two asks the lock added over PRD 10's baseline.
  - **Event page** `/family/timeline/events/[eventId]`: in-place edit via `InlineEditable` + `EventEditFields` (title / fuzzy when / where / who via `PeoplePicker` / Markdown story), clickable subject links to `/family/tree/[personId]`, a lightweight **photo linker** (that year's archive scans, toggle to link/unlink — no separate album picker), and a two-step delete (creator/admin).
  - **Nav + homepage**: `Timeline` link added to the Family nav group; homepage gains a third Legacy gateway ("The Timeline", live event count) and the old "Family Timeline" coming-soon tile is removed (now shipped).
  - **Verified**: `tsc --noEmit`, `eslint`, `next build` all clean; both routes compile as dynamic server routes. Migration applied to prod and the relational flow exercised on the live DB (see the migration note above; temp rows cleaned up). The only step not automatable is the authenticated in-browser click-through (needs a family login) — the data path beneath it is confirmed.
  - **Follow-ups**: (1) themed views (`/family/timeline/themes/[tag]`) — `events.tags` exists but no UI yet; (2) date ranges (`event_date_end`) deferred — single point/year per event for now; (3) slice 4 (Stories) can hang off events/people/albums next.
- **Slice 4 — Stories & Remembrances**: ✅ **built + PR'd** _(build session 2026-06-30; branch `claude/stories-slice4`)_. The final Legacy slice; text-first per the PRD (audio deferred).
  - **New migration** `supabase/migrations/20260630000004_stories.sql` — ⚠️ **NOT yet applied to prod** (build + PR only; awaiting Dan's go-ahead, as with prior slices). Adds `stories` (`title`, Markdown `body`, optional `album_id`/`event_id` links, audit cols; `created_by` is the recording member = the "author") and `story_people` (subjects → **`people`**, not `profiles`, so ancestors can be subjects — mirrors `photo_people`/`event_people`). Family-only wiki RLS; story delete narrowed to author/admin, join delete open for curation. Drizzle mirror (`stories`/`storyPeople` + types); `RevisionEntity` gained `"story"` (schema.ts + `src/lib/revisions.ts`).
  - **Attribution guardrail honored**: `createStory`/`updateStory` (`src/app/(app)/family/stories/actions.ts`) set `created_by`/`updated_by` (+ bump `updated_at`), sync `story_people`, and `recordRevision({ entityType: "story" })`; `deleteStory` (author/admin via RLS).
  - **Hub + detail**: `/family/stories` (newest-first list + "Record a Memory" `CreateFlow` with title / Markdown body / `PeoplePicker` subjects / optional album + event `<select>`s) and `/family/stories/[storyId]` (in-place `InlineEditable` edit, subject links to `/family/tree/[personId]`, Markdown body, links out to the linked album/event, author/admin delete). Shared loader `load-stories.ts` (`loadStorySummaries({ personId | albumId | eventId })`) + presentational `StoryList`/`storySnippet`.
  - **Surfaced everywhere** (the PRD's core promise): stories about a person appear on `/family/tree/[personId]`; stories linked to an album appear on the album page; stories linked to an event appear on the event page — each a compact `StoryList` section rendered only when non-empty.
  - **Nav + homepage**: `Stories` link added to the Family nav group; homepage gains the fourth Legacy gateway ("Stories & Remembrances", live story count). The Family gateway now leads with all four Legacy surfaces.
  - **Verified**: `tsc --noEmit`, `eslint`, `next build` all clean; both routes compile as dynamic server routes. Live DB round-trip NOT run (migration not yet applied to prod).
  - **Follow-ups**: (1) apply the migration to prod + live-verify (as slices 1–3 did); (2) audio recording + transcription (explicitly deferred — the highest-value capture for the eldest generation, layer on once the text surface is used); (3) a "record a memory about X" shortcut from the person/album/event surfaces (today authoring is centralized on the hub with the album/event/person pickers).
