# 37 — Paste Anything (Structured Ingestion of Existing Documents)

**Phase**: 7 (authoring assist) · **Depends on**: 32/34 (intake pipeline, review idiom, dictation text path), 33 (retention), **36 (the destinations — hard dependency)**
**Status**: 🚧 built (2026-08-01) — awaiting review + the live Dad-doc run on prod
**Parallel-safe with**: 35. Touches the intake surface + `src/lib/intake/*`.

---

## Why this exists

The information families need on these pages **already exists somewhere** — Dad's Loon-A-See Google Doc proved it. What doesn't exist is a way in: he pasted the whole thing into one textarea because that was the only door, and the result is a 4,400-character blob (his own heading asks "Seeing how this might be better formatted by Claude?"). Nobody — this family or any other — is going to hand-transcribe seventeen service providers into a contact form one field at a time.

Dan's framing: *have an opinion on where things go.* Take unstructured text and operationalize it — contacts become contacts (with PRD 36 kinds), the Wi-Fi becomes the Wi-Fi field, dates become reminder proposals, and the genuine prose comes back as clean markdown routed to Living Here / What We Ask. Same non-negotiable as every intake PRD: **the AI never writes.** It proposes; the member reviews and saves through the existing gated actions.

## Goal

A third door on the intake band — **Paste Text** — where a member pastes anything (a Google Doc, an email, an old house manual) and gets walked through everything it contains: contacts by kind, Wi-Fi, reminders, and tidied prose, each a reviewable save. Dad's actual doc is both the first eval fixture (scrubbed) and the first real run.

## What already exists (don't rebuild)

| Piece | State |
|---|---|
| Text-input extraction | `extractFromDictation` / `runExtraction` (`src/lib/intake/extract.ts`) — text in, fenced against prompt injection, structured output, parse-time whitelists. **Paste is a fourth intent through the same machinery**, not a new pipeline. |
| Store-before-model | `extractDictation` in `.../edit/intake/actions.ts` stores the raw `.txt` in the `intake` bucket first, orphan-rollback on row failure — copy this shape exactly |
| Review flow | `note-review.tsx` (source-aware), `calendar-review` reminder offers, `save-progress.tsx`, append semantics ("what's in the box is what saves") |
| Retention | PRD 33 panel covers any object in the bucket + `intake_documents` row — a paste inherits list/open/delete for free; `intakeKindLabel` gains a case |
| Destinations | PRD 36: `property_contacts.kind`, `properties.wifi_network/wifi_password`, the panels that make saving them worthwhile |
| Gated saves | `addPropertyContact`, `updateProperty`, `addPropertyReminder` — revisions, guest-blocked, privileged columns unreachable |

## Pre-flight decisions

| Decision | Recommendation | Why |
|---|---|---|
| **Own intent, not dictation reuse** | New `paste` intent in the registry. Dictation's prompt is tuned for speech (fillers, self-corrections, spoken dates); paste needs document register: pasted bullet salad (`●`/`○`), numbered sections, label-colon-value lines, headings. Output shape = dictation's shape **extended** (sections + contacts + reminders) with `kind` per contact, an optional `wifi` proposal, and `flaggedCredentials`. | Prompts diverge or both degrade. The machinery (`runExtraction`, fencing, `.txt` storage) is shared; only the intent entry is new. |
| **The credential catch** | The model must classify login/password/PIN/account-credential material into `flaggedCredentials` (service name + a *redacted* hint like "password for NH Electric", **never the secret itself** in the proposal payload). Flagged items are **excluded from every save path** and rendered as an advisory block: "This document contains account logins. We don't publish these; keep them in a password manager for now." Wi-Fi is the one exception — it routes to the PRD 36 Wi-Fi proposal. | Dad's real doc has three plaintext utility logins. Without this, "paste anything" republishes them onto a guest-visible page. Parse-enforced exclusion (not in any whitelist), prompt-assisted detection. The raw paste still lands in the private bucket verbatim (that's provenance, signed-URL only) — the catch governs what gets *proposed for the page*. |
| **Bulk contact review** | A checklist: every proposed contact as a row (name, phone/email, kind select pre-filled with the model's suggestion), all checked by default, uncheck to skip, one "Save Selected Contacts" that calls `addPropertyContact` per row. Per-row failures reported individually (PRD 30 idiom); progress line counts each. | Dad's doc proposes ~20 contacts. Twenty sequential one-at-a-time saves is the transcription chore this PRD exists to kill; a batch of individually-gated saves keeps the write posture while respecting the member's time. Anti-fabrication rule unchanged: no phone AND no email → not proposable (parse-enforced). |
| **Cleaning up an existing blob** | No new mechanism — it falls out of append semantics. The prose sections pre-fill *existing text + proposed tidy text* in the same textarea, and what's in the box is what saves; the member deletes the old blob right there. The review screen says so when the existing field is large ("Your current text is included below the new version; delete what the structured save replaced"). | This is exactly the Loon-A-See cleanup path, and it stays a human act on a human-visible box. |
| **Wi-Fi proposal** | Rendered as its own small review card (network + password, editable) → saves via `updateProperty` to the PRD 36 columns. Only offered when the model found both-or-either explicitly stated; never inferred. | One glance, one save, and the QR panel lights up. |
| **Size caps** | `MAX_PASTE_CHARS = 24_000` (~6× Dad's doc), min 40. Over-cap → clear error asking to paste in parts. | Haiku handles it (~$0.02 at the cap); unbounded paste is an abuse surface. |
| **Provenance** | Raw pasted text stored as `.txt` before the model call (dictation's exact shape), `intent = 'paste'`, retention label "Pasted document". | The verbatim source — passwords included — lives only in the private bucket behind signed URLs and PRD 33 delete, same as every bill photo with an account number on it. |
| **Eval fixtures are scrubbed** | The eval must include a Dad-doc-shaped fixture (structure, bullet chars, credential lines) with **fabricated credentials and phone numbers**. **Real passwords never enter the repo.** | Fixtures are committed; the repo is not the vault either. |

## In scope

- `paste` intent: types, JSON schema, `pastePrompt(todayIso)`, `parsePasteExtraction` (assembled from the existing parsers + kind whitelist + wifi + flaggedCredentials; anti-fabrication parse rules identical), `DocumentIntent` still excludes text intents from the vision path.
- Entry: third button "Paste Text" on the `AddDetailsBand`, matching chooser card, capture screen (large textarea, paste-forward copy, "Sort This Out" submit — or builder's Title Case equivalent), busy-state kept on the capture screen like dictation.
- **"Start from what's already on this page" (Dan's clarified intent, 2026-08-01)**: the capture screen offers a one-click way to pre-fill the textarea with the property's current `how_to` (and optionally `guidelines`) content, because the mess to be structured is usually *already in the app* — Dad's blob lives in "How things work here" today. The member shouldn't need to copy-paste text out of one field of the app into another. Extraction then proposes the Wi-Fi, contacts with kinds, reminders, and tidied prose from it, exactly as with pasted text; the pre-filled text is still stored as the `.txt` provenance source. This is the first real run's actual path.
- Action `extractPaste(propertyId, text)` — viewer resolve, guest reject, caps, store `.txt`, provenance row, extract, signed source URL.
- Review: note-review extended for source `paste`; bulk contact checklist with kind selects; Wi-Fi card; credential advisory block; reminders via the existing offer; progress line counts the batch.
- `intakeKindLabel`: "Pasted document"; retention panel needs nothing else.
- Eval `evals/intake/eval-paste.mts`: ≥15 fixtures (scrubbed Dad doc, Google-Docs bullets, an email, a plain typed list, a doc with *only* prose, one with planted credentials). Scored: zero fabricated contacts (phone-or-email), zero invented dates, **100% of planted credentials flagged and excluded**, Wi-Fi routed not flagged, kind accuracy recorded (not gated), content preservation. Results file committed like PRD 32/34.

## Out of scope

- File upload of docs (PDF/DOCX parsing) — photographing a printed page already works via PRD 32; text extraction from files is its own PRD if wanted.
- A credentials vault — flagged credentials are advised out, not stored anywhere new (PRD 07/08).
- Editing the `contact`/`note`/`dictation` intents beyond what compiles — **follow-up, noted**: the photo contact intent and dictation could also learn `kind` and Wi-Fi; do it as a small pass after this ships rather than growing this PRD.
- Auto-replacing narrative fields (append semantics stay; deletion is the member's act).
- Any new save action or privileged-column reachability (kind and Wi-Fi enter existing whitelists deliberately and narrowly).

## Verification recipe

1. **The Dad run (dev)** — paste the scrubbed fixture: ~20 contacts proposed with sensible kinds, Wi-Fi card shows `pinecoveharbour`-shaped value, credentials flagged into the advisory (and absent from every proposal), prose comes back as clean markdown routed to Living Here / What We Ask, reminders only where a date is stated.
2. **Bulk save** — uncheck two contacts, save the rest → each saved row has a revision; unchecked ones absent; progress line correct; one forced per-row failure reports individually.
3. **Anti-fabrication** — a prose-only paste: zero contacts, zero reminders, zero Wi-Fi; sections still proposed.
4. **Credential exclusion is parse-level** — a crafted model response smuggling a password outside `flaggedCredentials` fails parsing or is dropped (test the parser directly).
5. **Provenance + retention** — the paste appears as "Pasted document"; Open returns the verbatim text; Delete removes object + row.
6. **Caps + guest** — 24k+1 chars → friendly error; guest rejected at route and action.
7. **Eval** — run twice, zero fabrications, 100% credential catch; results committed.
8. **Live walk (prod, with Dan/Dad)** — paste the *real* doc, approve contacts/Wi-Fi/prose, trim the old blob in the same boxes, then delete the pasted source from retention once verified. Loon-A-See ends structured; Living Here ends human-sized.

## Likely file layout

```
src/lib/intake/schema.ts                                  # paste intent + parser + credential exclusion
src/lib/intake/extract.ts                                 # paste entry in INTENTS (runExtraction shared)
src/lib/intake/document-view.ts                           # "Pasted document"
src/app/(app)/properties/[slug]/edit/add-details-band.tsx # third door
src/app/(app)/properties/[slug]/edit/intake/intake-flow.tsx     # paste mode + chooser card
src/app/(app)/properties/[slug]/edit/intake/paste-capture.tsx   # textarea screen
src/app/(app)/properties/[slug]/edit/intake/actions.ts          # extractPaste
src/app/(app)/properties/[slug]/edit/intake/note-review.tsx     # paste source + bulk contacts + wifi card + advisory
evals/intake/eval-paste.mts + paste-samples.ts + results-paste-<date>.md
```

No migration expected (`intent` unconstrained, bucket mime-agnostic — confirmed in PRD 34; re-confirm).

## Reviewer sign-off (I check these)

- [ ] AI-never-writes intact: every save through existing gated actions with revisions; bulk save is N gated saves, not a new bulk action; privileged columns unreachable.
- [ ] Credential catch: parse-enforced exclusion, redacted hints only in proposals, advisory copy shipped, Wi-Fi exception exact; eval shows 100% catch on planted credentials.
- [ ] Anti-fabrication parse rules identical to note/dictation (phone-or-email, stated-date-only); eval zero fabrications.
- [ ] Scrubbed fixtures only — no real credential or phone number from Dad's doc in the repo (I will diff the fixture against the live blob).
- [ ] Raw paste stored before the model call, orphan-rollback present, retention list/open/delete verified.
- [ ] Prompt-injection fencing on the pasted text (it's the most attacker-shaped input intake has accepted yet).
- [ ] Copy: Title Case buttons, no em-dashes, advisory in sentence case.
- [ ] Live walk: the real Dad doc run end-to-end on prod, old blob trimmed, source deleted after verification.

---

## Implementation (2026-08-01)

Built directly on top of PRD 36, same session, in the worktree 36 was built in.
No migration: `intake_documents.intent` is unconstrained and the bucket is
mime-agnostic, both re-confirmed.

### Key files

| File | What |
|---|---|
| `src/lib/intake/schema.ts` | The `paste` intent: types, `PASTE_EXTRACTION_JSON_SCHEMA`, `pastePrompt(todayIso)`, `parsePasteExtraction`, and **`redactCredentials`** |
| `src/lib/intake/extract.ts` | `extractFromPaste` + the registry entry. `runExtraction` unchanged |
| `.../edit/intake/actions.ts` | `extractPaste`: guest reject, caps, store the `.txt` **before** the model call, provenance row with orphan rollback, signed source URL |
| `.../edit/intake/paste-capture.tsx` | The textarea, plus "start with what's already here" |
| `.../edit/intake/paste-review.tsx` | Credential advisory, Wi-Fi card, bulk contact checklist, tidied-document panel |
| `src/components/intake/narrative-form.tsx` | Lifted out of `note-review.tsx` so both reviews share one copy of the append semantics |
| `.../edit/intake/intake-flow.tsx` | `paste` phase, chooser card, `?mode=paste` |
| `.../edit/add-details-band.tsx` | Third door |
| `src/lib/intake/document-view.ts` | "Pasted document" |
| `evals/intake/paste-parser-check.mts` | 40 checks, no API key, no cost |
| `evals/intake/eval-paste.mts` + `paste-samples.ts` + `results-paste-2026-08-01.md` | 16 samples × 2 runs |

### The credential catch, as built

Three layers, because the prompt is a request and the page is guest-readable:

1. **The prompt** asks for logins in `flaggedCredentials` and nowhere else.
2. **`FlaggedCredential`** is `{ service, hint }` and nothing else, so there is
   no field in the type for a secret to travel in.
3. **`redactCredentials` runs over every proposable string** in
   `parsePasteExtraction` — the tidied document, both prose sections, contact
   labels/names/notes, reminder titles/notes, and the advisory's own hint.
   Anything it catches is folded back into the advisory, so a credential the
   model failed to flag still reaches the member as "removed from what we
   propose" rather than vanishing silently.

Two refinements came out of measurement, not design:

- **Wi-Fi is spared by adjacency, not by keyword.** "Wi-Fi Password: x" needs a
  14-character lookback, because the hyphen keeps "Wi-Fi" out of the matched
  label entirely. "The wifi is patchy upstairs. Account password: x" must still
  be redacted, which is why the window is short.
- **Identity labels are stricter than secret labels.** After `password`, a value
  is only redacted if it looks like a secret (a digit, a symbol, or length with
  mixed case) — otherwise "The password is written on the underside of the
  router" is destroyed, which is a useful how-to line. After `login` /
  `username`, the next token goes whatever it looks like: the eval caught
  `login mathiesonfamily` surviving into a tidied document precisely because an
  all-lowercase username has none of a password's shape.

### Decisions made during the build

- **`statedAs` on paste reminders.** "They bill in April" came back as 1 April in
  one run out of two, with that exact phrase already in the prompt as a negative
  example. Prompting was clearly not going to hold it, so a paste reminder now
  has to quote the words it read the day from, and the parser drops any date
  whose quote names no day (a numeral or a written-out ordinal). Structural, and
  it mirrors dictation's `spokenAs`.
- **911 is dropped in the parser.** The family document says "Emergencies — 911
  obviously" and the model was right to read it, but PRD 36 renders 911 as a
  fixed first row, so proposing it would save a duplicate.
- **Contact `kind` is scored, never gated.** A plumber filed "on the ground" is
  one click to fix; recording the accuracy is useful, failing a build on it is
  not.
- **The tidied document is read-only.** Everything worth saving out of it is
  offered above it; a second editable copy of a whole manual next to those would
  give the member two texts to reconcile.
- **Bulk saves run sequentially.** `addPropertyContact` reads the current maximum
  `sort_order` to place each new row, so twenty parallel inserts would race to
  the same position and land the document's careful ordering as noise.

### Verification status

- ✅ `tsc`, `eslint`, `next build` green.
- ✅ **40/40 parser checks** (`npx tsx evals/intake/paste-parser-check.mts`) —
  free, no API key, safe to run on every change.
- ✅ **Eval, 16 samples × 2 runs: 0 leaked, 0 fabricated, 0 missed**, 9 misrouted
  (all `kind` and section judgment calls). ~$0.0052/document, 3.4s average.
  Committed as `results-paste-2026-08-01.md`.
- ⏳ **No live walk yet.** The whole flow has never been exercised against a real
  session: no browser run, no real save. Everything above is compile-time,
  parser-level, or model-level.
- ⏳ The real Dad-doc run on prod is still owed, and is the point of the PRD.

### Follow-ups

- The photo `contact` intent and `dictation` still don't know about `kind` or
  Wi-Fi. Deliberately left (the PRD scopes it out); worth a small pass now that
  the destinations and the vocabulary exist.
- `MAX_SUGGESTED_REMINDERS` is 4 for paste as well as for a bill. A seasonal
  calendar page listing six dates will lose two. Raise it if the live run hits it.
