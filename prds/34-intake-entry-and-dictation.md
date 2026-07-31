# 34 — Intake Entry & Dictation (Speak or Photograph, Then Review)

**Phase**: 7 (authoring assist) · **Depends on**: 32 (Smart Intake pipeline — INTENTS registry, review idiom, gated saves), 33 (retention panel shares the intake page)
**Status**: 🚧 in review (2026-07-31) — PR #36, opened **unwalked**. Both slices built, build-green, eval clean (44 extractions, zero fabrications); no dictation exercised against prod. No migration needed.
**Parallel-safe with**: most feature PRDs (touches the property edit entry point + the intake surface; nothing else).

---

## Why this exists

Dad's two realities: a stack of paper, and a slow typing speed. PRD 32 solved the paper. This PRD solves two remaining friction points Dan called out after using it:

1. **The entry point hides.** "Add from a Photo" is a text link buried inside the Contacts panel header on `/properties/[slug]/edit` — you find it only if you were already going to add a contact. The typing-relief feature for the family's slowest typist should be the first thing he sees on the edit page, not an easter egg.
2. **There's no voice path.** Dictation is the other great typing-relief tool for this audience, and half of it already works: every textarea accepts the phone keyboard's built-in mic. What's missing is the cleanup — raw dictation is run-on, unpunctuated, and unrouted. The model pipeline that already turns a messy photo into reviewed, structured updates can do exactly the same for messy spoken text.

The product shape stays identical to PRD 32's non-negotiable: **the AI never writes.** Speech becomes proposed updates; the member walks through them and saves each one through the existing gated actions.

## Goal

On the property edit page, a member sees one clear "Add Details" moment with two equal doors — **Add from a Photo** and **Add by Voice** — and either door leads to the same experience: we read what you gave us, then walk you through each update it produces (contacts, page text, reminders), one reviewable save at a time.

## What already exists (don't rebuild)

| Piece | State |
|---|---|
| Intent pipeline | `extractFromDocument` + `INTENTS` registry (`contact` / `note` / `calendar`), parse-time whitelists, structured outputs (`src/lib/intake/extract.ts`, `schema.ts`) |
| Review flow | `/properties/[slug]/edit/intake` — chooser cards, `contact-review` / `note-review` / `calendar-review`, `PropertyCarryFields`, `refreshIntakeProperty` refetch |
| Note routing UI | `note-review.tsx` already walks a transcription piece-by-piece into House Rules / How Things Work / contacts — **this is the "take the user through the updates" experience**; dictation reuses it, not a new flow |
| Append semantics | Narrative fields pre-fill existing text + new lines; what's in the box is what saves (PRD 32 slice 2 decision) |
| Gated saves | `addPropertyContact`, `updateProperty`, `addPropertyReminder` — all with `recordRevision`, all guest-blocked, privileged columns unreachable |
| Entry link today | Text link inside the Contacts panel header on `edit/page.tsx` (~line 166) — the thing slice 1 replaces |

## Pre-flight decisions

| Decision | Recommendation | Why |
|---|---|---|
| **Where the entry lives** | A slim, full-width band directly under the edit page's `PageIntro`, above the Details panel: one sentence of invitation + two side-by-side buttons ("Add from a Photo", "Add by Voice"). Keep a one-line contextual link in the Contacts header (it's a good scent trail), but the band is the front door. | First thing on the page = first thing Dad sees. Two buttons, not a menu — he shouldn't have to discover a mode switcher. |
| **How prominent** | Operations restraint, not a marketing hero: `LedgerPanel` band, forest-accent left rule or button emphasis, `Button` default (filled) variant for both CTAs, ≥40px touch targets. No gradients, no icons-in-circles. | House style. "Stand out" means *placed first and visually complete*, not loud. |
| **How speech is captured** | A big textarea with a mic-forward prompt ("Tap the microphone on your keyboard and just talk") as the **universal** path, plus a Web Speech API (`webkitSpeechRecognition`) mic button shown **only where supported** as a convenience. No audio upload, no server-side transcription service. | Keyboard dictation works on every phone/tablet today with zero build and zero new vendors. Web Speech is a progressive enhancement, not a dependency — Claude's API doesn't accept audio, and adding a transcription vendor for v1 is scope creep. |
| **What the model does with speech** | A new `dictation` entry in the `INTENTS` registry that takes **text** instead of an image and returns the *same shape as the note intent*: cleaned/pretty markdown sections + routed destinations + suggested contacts (phone-or-email rule unchanged) — so `note-review.tsx` renders it as-is. | One registry entry + a text branch in the extraction wrapper, not a parallel pipeline. "Dictation is a note without a photo." The cleanup-to-markdown Dan asked for is the transcription-normalization step of this intent's prompt. |
| **The guided walkthrough** | Reuse the note review's section-by-section routing for both doors. Add a lightweight progress line at the top ("2 of 4 updates saved") and keep sections collapsible — but do **not** build a wizard with forced ordering. | The walk already exists; it needs orientation, not a rebuild. Forced step-order fights the "member decides what's worth saving" posture. |
| **Provenance for dictation** | Store the **raw dictated text** in `intake_documents` — same table, `intent = 'dictation'`, `storage_path` null-equivalent decision below — so the retention panel (PRD 33) shows voice sessions alongside photos. Recommendation: store the raw text as a small `.txt` object in the existing `intake` bucket so PRD 33's panel, policies, and delete path work **unchanged**. | The "check what was filled in against the source" promise should hold for voice too, and a `.txt` in the same bucket inherits every retention control for free. `intakeKindLabel` gains a "Spoken note" case. |
| **Reminders from dictation** | In scope for the intent schema (same anti-fabrication rules: no date stated → no suggestion), surfaced through the same "Also on this document" cross-offer. | "Remind me the propane bill is due on the fifteenth" is a primary dictation use case. |

## In scope

**Slice 1 — the front door (small, ship first)**
- The entry band on `/properties/[slug]/edit`: invitation sentence + "Add from a Photo" + "Add by Voice" buttons (voice button links to `edit/intake?mode=voice` or the chooser's voice card; photo goes to the chooser as today).
- Rendered only when `isIntakeConfigured()`; both buttons Title Case; band absent for guests (page already 404s them).
- The intake chooser page gains a fourth card — "Just talk" — so the voice door also exists for anyone landing on the chooser directly.

**Slice 2 — dictation**
- `dictation` intent in the registry: text in → `{ cleanedSections: [{markdown, suggestedDestination}], suggestedContacts, suggestedReminders }` — note-shaped, parse-validated, capped.
- Capture screen: textarea + keyboard-mic guidance + optional Web Speech mic button (start/stop, appends into the textarea, never auto-submits). A "Tidy and Review" button sends the text for cleanup.
- Review: `note-review` rendering the dictation result, plus the progress line ("N of M updates saved") added for both photo-notes and dictation.
- Provenance: raw text stored as `.txt` in the `intake` bucket + `intake_documents` row (`intent = 'dictation'`); retention panel label "Spoken note".
- Eval: `evals/intake/eval-dictation.mts` — ≥20 real-ish dictation transcripts (run-ons, self-corrections, "umm", mixed topics), scored for: no invented contacts (phone-or-email rule), no invented dates, faithful content preservation (nothing dropped), markdown quality. The PRD-32 evals each caught a shipping-breaking bug; do not skip this.

## Out of scope

- Server-side audio transcription (Whisper etc.) — revisit only if keyboard dictation genuinely fails the family.
- Editing/reflowing text the member typed by hand in other forms ("Tidy This Up" everywhere) — natural follow-on, separate PRD if wanted.
- Any new save path or any change to privileged-column reachability (the dictation intent's parse whitelist must match the note intent's).
- Auto-submission of anything; recording audio files.

## Verification recipe

1. **Entry band** — renders first on the edit page, both buttons ≥40px, absent when `ANTHROPIC_API_KEY` unset, absent for guests (page 404s); contextual Contacts link still present.
2. **Voice happy path** — paste (or dictate) a messy multi-topic transcript → cleaned markdown sections with sensible destinations → route one to House Rules (append semantics preserved), save a suggested contact, save a suggested reminder → each lands via the existing actions with revisions; progress line counts up.
3. **Anti-fabrication** — a transcript with no phone/email and no dates produces zero suggested contacts and zero reminders.
4. **Provenance + retention** — the dictation session appears in "Documents We've Read" as "Spoken note"; Open shows the raw text; Delete removes object + row (PRD 33 path untouched).
5. **Web Speech fallback** — in a browser without support, the mic button is absent and the textarea path works; mic button never auto-submits where present.
6. **Guest** — voice route 404s; `extractIntake` with the dictation intent rejects guests (same gate).
7. **Eval** — dictation eval run and results recorded in the PRD (fabrication count must be zero).

## Likely file layout

```
src/app/(app)/properties/[slug]/edit/page.tsx            # slice 1: entry band
src/app/(app)/properties/[slug]/edit/intake/page.tsx     # voice card on the chooser
src/app/(app)/properties/[slug]/edit/intake/intake-flow.tsx      # voice mode
src/app/(app)/properties/[slug]/edit/intake/dictation-capture.tsx  # textarea + mic
src/app/(app)/properties/[slug]/edit/intake/note-review.tsx      # progress line (shared)
src/app/(app)/properties/[slug]/edit/intake/actions.ts   # extractIntake accepts dictation text
src/lib/intake/schema.ts                                 # dictation intent schema + parser
src/lib/intake/extract.ts                                # text-input branch in the wrapper
src/lib/intake/document-view.ts                          # "Spoken note" kind label
evals/intake/eval-dictation.mts
```

No migration expected: `intake_documents.intent` is a text column and the bucket policies are path-agnostic. Confirm at build time; if `intent` has a check constraint, one additive migration extends it.

## Reviewer sign-off (I check these)

- [x] AI-never-writes posture intact: dictation produces proposals only; every save goes through the existing gated actions with `recordRevision`; privileged columns unreachable from the new intent's parser.
- [x] Anti-fabrication is parse-enforced (contacts phone-or-email via `parseNoteExtraction`, reminders date-validated via `parseCalendarExtraction`), not prompt-requested; eval run with zero fabrications.
- [x] Raw dictated text stored with the same privacy posture as photos (private bucket, signed-URL only, guests excluded, PRD 33 delete path works on it unchanged).
- [x] Entry band follows house restraint (no gradients/icon circles; Title Case; `Button` default size = 40px) and is absent when intake is unconfigured.
- [x] Web Speech is enhancement-only: absent ≠ broken, present ≠ auto-submit.
- [x] No new guest-reachable surface; `extractDictation` rejects guests at the top, the page still 404s them.
- [ ] **Live walk: not done.** One dictation session on prod producing a page edit + a contact + a reminder, then deleted from the retention panel.

## Implementation

**No migration.** Confirmed at build time, as the PRD expected: `intake_documents.intent` has no check constraint and the `intake` bucket has no `allowed_mime_types`, so a `text/plain` object and an `intent = 'dictation'` row both land with the existing policies untouched.

**Key files**

| File | What it does |
|---|---|
| `src/app/(app)/properties/[slug]/edit/add-details-band.tsx` | Slice 1: the front door. Sits above Details, two buttons, rendered only when intake is configured. |
| `src/app/(app)/properties/[slug]/edit/page.tsx` | Renders the band; keeps the Contacts-header link as a scent trail. |
| `src/lib/intake/schema.ts` | `dictation` intent: types, JSON schema, `dictationPrompt(today)`, `parseDictationExtraction`, `generateIntakeTextPath`, plus the `DocumentIntent` split. |
| `src/lib/intake/extract.ts` | `extractFromDictation` + `runExtraction`, the model call now shared by every intent. |
| `.../edit/intake/actions.ts` | `extractDictation(propertyId, text)` — stores the transcript, then tidies it. |
| `.../edit/intake/dictation-capture.tsx` | Textarea + keyboard-mic guidance + optional Web Speech button. |
| `.../edit/intake/intake-flow.tsx` | Voice mode, the fourth chooser card, the progress count. |
| `.../edit/intake/note-review.tsx` | Now takes `source`, so one screen serves both photo notes and speech. |
| `.../edit/intake/calendar-review.tsx` | `spokenAs` disclosure + save reporting. |
| `src/components/intake/save-progress.tsx` | "2 of 4 updates saved". |
| `evals/intake/eval-dictation.mts` + `dictation-samples.ts` | 22 transcripts × 2 runs; results in `results-dictation-2026-07-31.md`. |

**Decisions made during the build**

- **Dictation is the note shape plus reminders, not a new shape.** The PRD described the output two ways — "the same shape as the note intent" in pre-flight and `{cleanedSections: [...]}` in scope. The first reading won, because the binding constraint is the sentence after it: *"note-review.tsx renders it as-is"*. A free-form `cleanedSections` array would have required a new review component, and the walkthrough the PRD wants dictation to reuse is precisely the one that already exists. So `DictationExtraction = NoteExtraction & { suggestedReminders }`, `parseDictationExtraction` is assembled from the two parsers either side of it, and the whole review surface is the note screen with a `source` prop that changes only the wording.
- **The date is the one thing the model is allowed to produce that wasn't said, and it is bounded on both sides.** "Remind me the propane is due on the fifteenth" is the PRD's own primary use case, and it cannot be served without resolving relative words against today's date — that is real inference, unlike every other intent where the rule is "copy what's printed". So the model must quote the words it resolved (`spokenAs`), and the review screen shows the member *"You said 'the fifteenth'. Check that we've worked out the right day."* next to the date box. They confirm the arithmetic, not just the reading. It is also why `dictation` is the first registry entry whose prompt is built per call rather than fixed.
- **Reminders come from the same extraction, not a second read.** The photo intents offer "also check this document for a due date" because the file is still in the bucket and a second pass is cheap. There is no second thing to read here: the date sentence is inside the same paragraph as everything else, so asking again would mean paying twice for the same tokens.
- **The transcript is stored before the model call, not after.** It is the member's own words and the one artefact they cannot reproduce by pressing a button again — storing it afterwards would lose it in exactly the case they most need it. If the provenance row then fails to write, the object is removed again rather than left as the invisible orphan PRD 33 exists to eliminate.
- **The capture screen keeps its own busy flag instead of moving to a `working` phase.** Every other intent transitions the whole flow while it waits. Doing that here would unmount the textarea, so a failed tidy-up would take the dictation down with it. A failure now leaves the text on screen with the error beside the button.
- **Keyboard dictation is the path; Web Speech is a convenience.** Every phone in the family already has a microphone on its keyboard: no permission prompt from us, no audio leaving the device, no vendor. The Web Speech button appends into the same textarea, never auto-submits, and is absent where unsupported — read through `useSyncExternalStore` rather than detected in an effect, so it neither mismatches on hydration nor flashes a control that can't work.
- **The transcript is fenced and labelled as material, not instructions.** A dictation containing something that reads like a command is tidied, not obeyed. The structured-output schema is the real guarantee — nothing outside it can be returned, and no privileged property column is in it — but the framing costs nothing.
- **The progress count lives in `IntakeFlow`, not in the review forms.** A dictation's updates are spread across two components (note routing, then reminders), and "2 of 4" is only true if it counts both. It counts and nothing more: no forced ordering, no completion state, and leaving updates unsaved is a perfectly good outcome.

**Verification**

- `npx tsc --noEmit` clean · `npx eslint` clean on touched paths · `npm run build` green.
- **Eval: 44 extractions, 314 scored fields, zero fabrications** (`evals/intake/results-dictation-2026-07-31.md`). 36/36 sessions naming nobody reachable produced zero contacts; 32/32 naming no day produced zero reminders, including "soon", "before winter", and a date already past. All 14 stated dates resolved correctly across four forms of expression, every one with `spokenAs` populated. Self-correction handled ("four four one seven no wait... four four seven one" → 4471). ~$0.0034 and 2.4s per dictation.
- The eval's own first run reported 4 fabrications that turned out to be scorer artifacts; the fix was to the scorer, never to the prompt or schema, and the whole progression is written up in the results file rather than quietly overwritten.
- **Not walked live.** No dictation has been run against prod, so the recipe's steps 2, 4, and 6 (happy path end to end, the transcript appearing in "Documents We've Read" as a Spoken note, guest 404) are unverified outside the build.

**Follow-ups**

- Server-side audio transcription stays out, per pre-flight — revisit only if keyboard dictation genuinely fails the family.
- "Tidy This Up" on hand-typed fields elsewhere is the natural follow-on and remains a separate PRD.
- The `how_to` / `guidelines` split is a judgement call the model gets differently from a person about a quarter of the time. Every instance is visible and editable before saving, so it is a cost rather than a defect, but if it grates in real use the fix is a "move this to the other section" control rather than a better prompt.
