# 12 — Authoring UX (the shared content-editing layer)

**Phase**: 2.5 (foundational) · **Depends on**: nothing new — retrofits existing features
**Status**: 🟢 ready — **build this before [11 — Family Legacy](11-family-legacy.md)**; Legacy is entirely content authoring and should consume this layer natively. Also retrofit to properties + profiles.

---

## Why this exists

The site is "wiki-style — anyone in the family can edit." But the *actual* editing experience today is built for someone fluent in developer conventions, not for a non-technical family member (and especially not for the eldest generation, who are the most important contributors to the legacy material). Concrete problems, all in shipped code:

- **Long-form content is a raw Markdown `<textarea>`.** To make a heading or a list, you type `## How things work` and `- Trash out Tuesday`. No toolbar, no preview, no "bold" button. See [property-edit-form.tsx](../src/app/(app)/properties/[slug]/edit/property-edit-form.tsx) (description / how_to / guidelines) and the profile bio field.
- **Cryptic structured inputs.** Amenities are "one per line"; peak periods are typed as `07-01 → 08-31`.
- **Editing is hidden on a separate `/edit` page** — no "click the thing on the page to change it."
- **No preview, no autosave, no formatting help.**

The bright spots — and the patterns to generalize — are the **drag-drop `PhotoUpload`** (genuinely friendly, mobile camera support) and the **peak-period chip editor** (`PeakRangeEditor` in the property form), which is exactly the add/remove-row pattern the rest of the app should use instead of "one per line."

This PRD defines a **shared authoring layer** — a small set of components and patterns — used by every feature so that creating and editing content never exposes syntax or conventions. Legacy is the first consumer; properties and profiles get retrofitted.

## Goal

A non-technical family member can create and edit any content on the site — a property page, their bio, a photo album, a story — **without ever seeing Markdown syntax, typing a date in a special format, or hunting for a hidden edit page.** Editing should feel like Google Docs / Notion, not like filling out a developer form.

## Onboarding (read first if you're picking this up cold)

1. **Read** [CLAUDE.md](../CLAUDE.md), [00-master-plan.md](00-master-plan.md), then this file.
2. **Read [AGENTS.md](../AGENTS.md) and the Next.js docs in `node_modules/next/dist/docs/`** before adding any editor dependency — this is Next 16 / React 19, and editor libraries are exactly the kind of thing that breaks across versions. **Verify React 19 + Next 16 + Turbopack compatibility before adopting any lib.**
3. **Preserve the security model**: content is stored as **Markdown** and rendered through `src/components/markdown.tsx`, which deliberately allows **no raw HTML passthrough**. The editor must keep Markdown as the stored format (or sanitize rigorously) — do not introduce an HTML pipeline that bypasses this.
4. **You will reuse**: `Markdown` (for live preview — same renderer as display, so WYSIWYG is truthful), `recordRevision()` (every edit logs history), the Server-Action + `revalidatePath()` write pattern, and the `PeakRangeEditor` chip pattern as the template for list editing.

## Design principles

1. **Never show raw syntax.** Formatting via a toolbar; the user sees the result, not the markup.
2. **Edit where you read.** Inline "Edit" affordances on the page; avoid the separate-edit-page round trip where feasible.
3. **Guided over freeform.** Pickers, chips, and date pickers instead of "one per line" / "MM-DD".
4. **Forgiving.** Clear save state, edit history (revisions) as undo, no destructive surprises. The form already shows "Saved. Logged to revisions." — keep and standardize that reassurance.
5. **Mobile- and age-friendly.** Large tap targets, readable type, works on an iPad. The eldest generation is the key audience for legacy content.
6. **Accessible.** Labels, focus states, keyboard support, sufficient contrast.

## The shared layer (components to build)

Put these under `src/components/authoring/`. Each is feature-agnostic and consumed by properties, profiles, and all of Legacy.

| Component | What it does | Replaces today's… |
|---|---|---|
| **`RichTextField`** | The core. A friendly editor for long-form content with a formatting toolbar (Bold, Italic, Heading, Bullet/Numbered list, Link, Quote) and a **Write / Preview** toggle that renders via the existing `Markdown` component. Stores Markdown. | Raw `<Textarea>` with "Markdown supported" hint |
| **`ChipListField`** | Add/remove discrete items with a button + Enter, each a removable chip. | Amenities "one per line" |
| **`FuzzyDateField`** | A real date picker for exact dates **plus** a free "circa / era" mode ("circa 1968", "summer 1972") for old photos that have no exact date. | (new — needed by Legacy) |
| **`PeoplePicker`** | Typeahead over `people` (and `profiles`) to tag subjects by name instead of typing IDs. | (new — needed by Legacy photo/story tagging) |
| **`InlineEditable` / edit affordance** | A standard "Edit" pencil + edit-in-place (or a consistent inline edit panel) with Save / Cancel, a "Saved" confirmation, and automatic `recordRevision`. | Separate `/edit` pages |
| **`CreateFlow` pattern** | A consistent "+ Add" entry (dialog or focused page) with the *minimum* required fields and an instant save, for albums / people / events / stories. | (new — make creation feel light) |

### Editor approach — the one real decision

| Option | Pros | Cons | Recommendation |
|---|---|---|---|
| **Lightweight toolbar over `<textarea>` + Markdown preview** | Minimal/no new deps; we fully control it; keeps Markdown storage + existing renderer; low risk on Next 16/React 19 | Not true WYSIWYG (a Preview tab, not live-rendered editing) | **Start here (v1).** Ships fast, safe, removes the syntax barrier for 90% of needs. |
| **Tiptap (ProseMirror) true WYSIWYG** | Real in-place rich editing; best feel for non-technical users | Heavier; needs Markdown serialization both directions; must verify Next 16/React 19/Turbopack compat; bigger surface to secure | Evaluate as v2 if the family wants *zero* Markdown ever. Don't lead with it. |

Keeping Markdown as the stored format in both options preserves the no-raw-HTML security posture and means display and editing use the same renderer.

## Retrofit targets (apply the layer to what's shipped)

1. **Property edit** — description / how_to / guidelines → `RichTextField`; amenities → `ChipListField`. ([property-edit-form.tsx](../src/app/(app)/properties/[slug]/edit/property-edit-form.tsx))
2. **Profile edit** — bio → `RichTextField`. ([profile-edit-form.tsx](../src/app/(app)/profile/edit/profile-edit-form.tsx))
3. Then **Legacy (PRD 11)** consumes the layer from day one (album/person/event/story bodies via `RichTextField`; tags via `PeoplePicker`; photo dates via `FuzzyDateField`; lists via `ChipListField`).

## Sequencing (small slices)

1. **`RichTextField`** + retrofit property + profile long-form fields. Immediate, visible win the whole family feels.
2. **`ChipListField` + `FuzzyDateField`** + retrofit amenities; ready the date picker for Legacy.
3. **`PeoplePicker`** (needs the `people` table — coordinate with Legacy slice 1; can land alongside it).
4. **Inline-edit affordance + `CreateFlow` polish** — move editing onto the page, make "+ Add" feel light everywhere.

Each slice: branch, ship, fill Implementation, flip status here + in the master-plan queue.

## Cross-cutting decisions

| Decision | Recommendation | Why |
|---|---|---|
| **Stored format** | Markdown (both editor options) | Preserves no-raw-HTML security model + single renderer for edit preview and display. |
| **Save model** | Explicit "Save" with clear state for v1; consider autosave/draft later | Simpler and predictable first; autosave is a nice-to-have. |
| **History/undo** | Keep routing every write through `recordRevision()` | Edit history *is* the undo story; already built. |
| **Permissions** | Unchanged — wiki-style, `canManageProperty()` etc. | This PRD changes the *how* of editing, not the *who*. |
| **New dependencies** | Prefer none for v1; if any, verify Next 16 / React 19 / Turbopack first | Per AGENTS.md — this Next is not the one your training data knows. |

## Verification recipe (test as a non-technical user would)

1. **Bold + list, no symbols** — on a property's "How things work", make a word bold and add a bullet list using only toolbar buttons; Preview matches the live page exactly.
2. **Amenity by button** — add "Kayak" and remove "Canoe" with buttons/chips, no newlines typed.
3. **Tag a person by name** — start typing a relative's name, pick them from the dropdown (no IDs).
4. **Fuzzy date** — set a scanned photo to "circa 1968" with no exact day, and a modern photo to an exact date via the picker.
5. **Edit in place** — click Edit on a block, change it, see "Saved", and confirm a `revisions` row was written.
6. **Mobile** — do steps 1–4 on an iPad-sized viewport; targets are big enough and nothing overflows.

## Likely file layout

```
src/components/authoring/
  rich-text-field.tsx        # toolbar + Write/Preview (v1)
  chip-list-field.tsx        # add/remove chips (generalize PeakRangeEditor)
  fuzzy-date-field.tsx       # date picker + circa/era mode
  people-picker.tsx          # typeahead over people/profiles
  inline-editable.tsx        # edit-in-place wrapper + save state
  index.ts

# retrofits
src/app/(app)/properties/[slug]/edit/property-edit-form.tsx   # use RichTextField + ChipListField
src/app/(app)/profile/edit/profile-edit-form.tsx              # use RichTextField
```

## References / reuse

- `src/components/markdown.tsx` — the renderer; reuse for truthful preview
- `PeakRangeEditor` in [property-edit-form.tsx](../src/app/(app)/properties/[slug]/edit/property-edit-form.tsx) — the chip pattern to generalize
- `src/components/photo-upload.tsx` — the gold standard for "friendly, mobile-first" interaction
- `recordRevision()` (`src/lib/revisions.ts`) — history/undo
- shadcn primitives in `src/components/ui/` (Button, Input, Popover, Command for typeahead, Dialog for create flows)

## Implementation

_Filled in per slice as each ships._

- **Slice 1 — RichTextField + property/profile retrofit**: _status: not started_
- **Slice 2 — ChipListField + FuzzyDateField**: _status: not started_
- **Slice 3 — PeoplePicker**: _status: not started (coordinate with Legacy slice 1 / `people` table)_
- **Slice 4 — Inline edit + CreateFlow**: _status: not started_
