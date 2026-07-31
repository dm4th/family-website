# 34 — Intake Entry & Dictation (Speak or Photograph, Then Review)

**Phase**: 7 (authoring assist) · **Depends on**: 32 (Smart Intake pipeline — INTENTS registry, review idiom, gated saves), 33 (retention panel shares the intake page)
**Status**: 🟢 ready (2026-07-31)
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

- [ ] AI-never-writes posture intact: dictation produces proposals only; every save goes through the existing gated actions with `recordRevision`; privileged columns unreachable from the new intent's parser.
- [ ] Anti-fabrication is parse-enforced (contacts phone-or-email, reminders require a stated date), not prompt-requested; eval run with zero fabrications.
- [ ] Raw dictated text stored with the same privacy posture as photos (private bucket, signed-URL only, guests excluded, PRD 33 delete path works on it).
- [ ] Entry band follows house restraint (no gradients/icon circles; Title Case; ≥40px targets) and disappears cleanly when intake is unconfigured.
- [ ] Web Speech is enhancement-only: absent ≠ broken, present ≠ auto-submit.
- [ ] No new guest-reachable surface; the PRD 32/33 gates still hold end-to-end.
- [ ] Live walk: one dictation session on prod producing a page edit + a contact + a reminder, then deleted from the retention panel.

## Implementation

_(Fill in when built: key files, decisions, follow-ups.)_
