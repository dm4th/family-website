# 10 — Family Timeline & History

**Phase**: 4 · **Depends on**: photo collection has reached critical mass

## Goal

Preserve family history — stories, milestones, the older generation's memories — in a structured, browsable timeline. This is the "legacy" feature: the thing the next generation will care most about in 20 years.

## User stories

- As a grandchild curious about family history, I scroll a timeline showing family events back through the decades with photos.
- As a member of the eldest generation, I record (or have a relative record) a short story about a memory; it's tied to a date and the people involved.
- As any member, I tag photos with the year and the people in them; the timeline assembles automatically.
- As an admin, I curate a "best of" or themed view (e.g., "Loon Lake summers" or "Wedding photos").

## In scope (candidates)

- `events` table: title, description (Markdown), date / date-range, location, people involved (FK to profiles)
- Timeline view (`/timeline`) — vertical chronological scroll with photos and stories
- Photo tagging by year + people (extends `photos` and `photo_subjects` from Phase 1)
- Story recording — text now, audio later (think: "Grandpa tells the boathouse story")
- Family tree visualization — D3 or a lightweight tree component, fed from `profiles` + a `family_relationships` graph table

## Out of scope (initial)

- Video uploads (heavy; defer until storage costs make sense)
- AI-generated "memory of the day" prompts
- Genealogy import from Ancestry / FamilySearch
- Public sharing of the family tree externally

## Open questions

- Story format: text-only at first vs. audio? Recommendation: text-only at first; audio is high-leverage but needs transcription too.
- Add `family_relationships` graph table now or later? Recommendation: later — wait until the simple `family_branch` + `relationship_notes` model breaks down.
- Privacy: are deceased family members included? How do we honor the older sister's memory tastefully? Needs a conversation.

## References / reuse

- Same photo / photo_subjects tables from Phase 1
- Same edit pattern as properties (wiki-style with revisions)
