# 32 — Smart Intake (Photo → Pre-filled Property & Calendar Details)

**Phase**: 7 (authoring assist) · **Depends on**: 03 (properties + `property_contacts` + `canManageProperty`), 05 (Supabase Storage upload), 06 (bookings/calendar + `events`), 27 (direct-write posture — AI never writes, only pre-fills)
**Status**: ✅ slice 1 shipped ([PR #32](https://github.com/dm4th/family-website/pull/32), merged 2026-07-30). 🚧 slice 2 (handwritten notes) in review (2026-07-30). Slice 3 (calendar events) still 🟢 ready. **Dependency: server-side Claude vision (Anthropic API key), model `claude-haiku-4-5`.**
**Parallel-safe with**: most feature PRDs (adds a new intake route + one server action; touches the existing contacts / property / calendar forms only to accept pre-filled initial values).

**Slices are sequenced and each ships behind Dan's review** (I review every slice PR before merge). The full three-slice build is written out below so the implementing agent has the complete trajectory up front — Slice 1's foundations (the extraction service, the review-and-save UI shell, the source-file store) are deliberately built to be reused by Slices 2 and 3. Build Slice 1 first, but build it knowing 2 and 3 are coming.

---

## Why this exists (the pain)

Dad is about to start entering property and calendar data by hand. He's a slow typist, and his source material is **paper** — utility bills, insurance statements, tax notices, handwritten notes. Retyping a vendor's name, phone, account number, service address, and due dates off a bill is exactly the friction that stops an older user from ever finishing.

The fix families reach for now: **photograph the paper, let a vision model read it, and hand back a pre-filled form he just confirms.** A 10-minute typing job becomes a 20-second review.

## Goal

From a property page, a member uploads a photo or PDF of a bill (or a handwritten note). A Claude vision model extracts structured fields, and the site opens the **existing** edit form(s) **pre-filled** with what it found — a vendor contact, a property field, and/or a calendar event. The member reviews, corrects anything wrong, and saves. **Nothing is written to the database until the member confirms.**

## The one non-negotiable principle (applies to all three slices)

**The AI never writes. It only pre-fills a form a human confirms.** This is a hard rule across every slice, for three reasons:
1. It keeps us consistent with the direct-write hardening posture ([PRD 27]) — every write still goes through the same gated Server Action (`addPropertyContact` / `updateProperty` / the calendar/event create action), with the same `canManageProperty` / not-`is_guest()` checks and `recordRevision()` audit trail. Smart Intake is a *typing aid*, not a new write path.
2. OCR on handwriting and photographed bills is imperfect. A wrong read must be a 2-second edit, never a bad saved record.
3. For a cautious, older user, "you are always in control, nothing saves until you press Save" is what makes it feel safe instead of magical-and-scary. Decided in scoping: **always review before save; no auto-save of any field, ever.**

## Shared architecture (built in Slice 1, reused by 2 & 3)

These pieces are built once in Slice 1 and are the spine of the whole feature. Build them generically enough that Slices 2 and 3 only add a new *target schema* and a new *review form*, not a new pipeline.

- **Upload + source store.** Reuse `PhotoUpload` / direct-to-Supabase-Storage ([src/components/photo-upload.tsx](../src/components/photo-upload.tsx)); accept image + PDF. Store the source file in a **private** bucket (provenance + re-review), signed-URL access only. Treat it as sensitive (account numbers, policy numbers).
- **Extraction Server Action** (`extractIntake`). Server-side only. Takes the uploaded file + an **intent** ("contact" | "property" | "note" | "calendar") and returns a parsed, schema-validated object. **Never writes.** Rejects `is_guest()`. This action is generic across slices — the intent selects which schema/prompt to use.
- **Extraction client wrapper** (`src/lib/intake/extract.ts`). Wraps the Claude vision call (Anthropic SDK server-side, or Vercel AI Gateway with an `"anthropic/…"` model string). Structured output via tool-use so the model must return the schema. Key stays server-only.
- **Schemas** (`src/lib/intake/schema.ts`). One zod/JSON schema per intent, each returning `{ fields, confidence (per-field), rawText }`. Slices 2 and 3 add their schemas here.
- **Review-and-save UI shell.** A reusable "here's what we read, edit and confirm" surface: every field editable, low-confidence fields visually flagged, abandoning it writes nothing. Slices 2 and 3 drop their target form into this shell.
- **Cost guardrails.** Per-file size cap, one extraction per upload (no auto-retry loops), a clear "reading your document…" pending state. Log per-extraction token/cost so we can watch spend.

## The new dependency (the only genuinely new infrastructure)

Everything else reuses shipped plumbing. The one new thing: **a server-side Claude vision call**, which needs:
- `ANTHROPIC_API_KEY` set in Vercel (Dan — owner action), **server scope only**. Never `NEXT_PUBLIC_`. Never printed.
- One SDK dependency (`@anthropic-ai/sdk`, or `ai` + Gateway). Confirm the current install path per the Vercel AI SDK skill before adding — **do not** hardcode from memory.
- A small per-extraction cost (cents per document). Record it in each slice's implementation section once measured.

## Pre-flight decisions (whole feature)

| Decision | Recommendation | Why |
|---|---|---|
| **Model / provider** | Claude vision (latest Sonnet-class) via the Anthropic SDK server-side, or the Vercel AI Gateway with an `"anthropic/…"` model string. Structured output via tool-use. | Vision + strong structured extraction; Gateway gives observability + fallback without provider lock-in. Key stays server-only. |
| **Where extraction runs** | A Server Action (Node runtime, Vercel Fluid Compute). Images/PDFs up to ~100 MB are fine on Functions now; no separate service. | Keeps it in-repo, no new infra, key never reaches the client. |
| **Write path** | Reuse existing gated actions **unchanged**. Intake only produces *initial form values*. | One audited, gated write path (PRD 27). Extraction can't become a bypass. |
| **Confidence handling** | Model returns per-field confidence; UI flags low-confidence fields but **never** hides or auto-commits. | Honest about OCR limits; keeps the human in the loop. |
| **Source file retention** | Store the uploaded document privately, linked to the created record for provenance; signed-URL only. | Lets Dad re-open the original if a field looked off. Never family-public. |
| **Never touch privileged fields** | Extraction may propose only wiki-open fields. **Never** `status` / `max_guests` / `peak_period_ranges` / `hero_image_path` (PRD 27-gated). | Extraction stays firmly outside the privileged surface. |

---

## Slice 1 — Property details from a bill  ·  🎯 first

**What it does.** Upload a bill on `/properties/[slug]/edit` → extract a **vendor contact** and (if present) the **service address** → pre-fill the existing contact form (and offer the address fill) → member reviews → Save.

**Why contacts first.** A utility/insurance/tax bill is mostly *a vendor plus a service address* — exactly what our tables already hold, no new columns. And `property_contacts` is **wiki-open to any non-guest member** (no `canManageProperty` needed to add a contact), so this satisfies "any family member can add content" immediately.

**Extraction target — a `property_contacts` row:**
| Extracted from bill | Column |
|---|---|
| "Pacific Gas & Electric", "State Farm" | `label` (kind, e.g. "Electric utility") + `name` (company) |
| Customer service / billing phone | `phone` |
| Billing / support email | `email` |
| Account #, policy #, billing period, amount due | `notes` (free text, human-reviewed) |

**Secondary target — `properties.address`** only when confidently present and the property's `address` is empty. Offered as a fill, routed through `updateProperty`. No other property field.

**In scope**
- **Add from a Photo** entry on the property edit page, opening the intake flow (modal or `/properties/[slug]/edit/intake`).
- The full **shared architecture** above (upload + source store, `extractIntake`, wrapper, schema, review shell, guardrails) — built here, reused later.
- Pre-fill the existing contact form via `addPropertyContact`; offer address via `updateProperty`. Both actions unchanged.
- Guest lockout on entry + action (mirror `requireMember()` from [admin/actions.ts]).

**Verification**
1. **Happy path** — clear utility bill → vendor name/phone/account pre-fill → Save → contact appears, `recordRevision` logged.
2. **Address fill** — bill with a service address on a property whose `address` is empty → offered → accept routes through `updateProperty`.
3. **Bad read is editable** — blurry/handwritten input → every field editable, low-confidence flagged, nothing saves until Save.
4. **No silent writes** — abandon review → **zero** rows created (contacts + revisions untouched).
5. **Guest blocked** — no intake entry; direct `extractIntake` call rejected.
6. **Privileged fields untouched** — extraction never proposes status/max_guests/peak/hero.
7. **Secret hygiene** — `ANTHROPIC_API_KEY` not in any client bundle; not `NEXT_PUBLIC_`.

**Likely file layout**
```
src/app/(app)/properties/[slug]/edit/intake/    page.tsx / intake-modal.tsx   # upload → review-and-save
src/app/(app)/properties/[slug]/edit/actions.ts  extractIntake(...)           # server-only vision call, NO write
src/lib/intake/extract.ts                        # Anthropic/Gateway client wrapper (server-only)
src/lib/intake/schema.ts                         # extraction schemas (contact/property here; +note/calendar later)
src/components/intake/review-shell.tsx           # reusable "read it, edit, confirm" surface
```

---

## Slice 2 — Handwritten notes → property notes / free-form

**What it does.** Upload a photo of Dad's **handwritten notes** about a property ("gate code is round back, plumber is Jim 555-1234, turn water off at the road in winter") → extract into **structured-ish free text** the member can drop into the property's `guidelines` / `how_to` fields, or into a contact's `notes`, or split into several contacts → member reviews → Save.

**Why second.** It's the natural neighbor of Slice 1 — same target family (property fields + contacts), same forms, so it reuses Slice 1's entire pipeline with only a new schema + a note-oriented review form. It's also where "review before save" matters most (handwriting is the hardest OCR case), so doing it while the pipeline is fresh — before the different calendar target in Slice 3 — keeps the momentum on the property-details surface.

**Extraction target — free-form, member-routed:**
- A cleaned-up transcription of the note (the model's best read), shown alongside the option to route pieces into: `properties.guidelines`, `properties.how_to`, or one-or-more `property_contacts.notes`.
- Where the note clearly names a person + phone ("plumber Jim 555-1234"), **offer** a pre-filled contact (reusing Slice 1's contact form) in addition to the raw transcription.

**In scope**
- New `note` intent + schema (returns `{ transcription, suggestedContacts[], suggestedGuidelines, confidence }`).
- Review shell variant that shows the transcription prominently (low-confidence handwriting flagged heavily) and lets the member choose destinations; each destination saves through its existing gated action.
- Strong "this is our best read, please check it" framing — handwriting reads are lower-confidence by nature.

**Out of scope**
- Perfect handwriting OCR (set expectations; the value is a head start, not a guarantee).
- Auto-routing without the member picking the destination.

**Verification**
1. Legible note → clean transcription, sensible destination suggestions, edits stick, Save writes only chosen destinations.
2. Note naming a person + phone → contact offered pre-filled; accepting routes through `addPropertyContact`.
3. Messy handwriting → transcription still editable, confidence flags visible, member can fix before Save.
4. Abandon → zero writes. Guest blocked. Secret hygiene holds.

---

## Slice 3 — Calendar events from due dates

**What it does.** A bill (fresh or re-uploaded) → extract the **due date + amount + what it's for** → pre-fill a **calendar event** on the property, with an optional **recurrence** ("every month", "annually") → member reviews → Save. Turns "water bill due the 15th" into a reminder without hand-entering a date.

**Why last.** It's the highest-value *different* target (deadlines slipping is the other big pain), but it points at the calendar/`events` model rather than property fields, so it's the cleanest thing to add once the property-details surface (Slices 1–2) is solid. It still reuses the whole pipeline — only a new schema + a review form on the existing calendar create path.

**Extraction target — a calendar event** (map to the existing `events` / booking-calendar model from [PRD 06]; confirm exact table + create action at build time):
| Extracted from bill | Field |
|---|---|
| Due date | event date |
| "Water bill", vendor | title / description ("Water bill due — PG&E") |
| Amount due | included in description/notes (not a money column unless one exists) |
| "monthly", "quarterly", "annual" billing | proposed recurrence (member confirms; default one-off if unsure) |

**In scope**
- New `calendar` intent + schema; new prompt path in `extractIntake`.
- A calendar review form dropped into the shared review shell; Save routes through the **existing** calendar/event create action (unchanged, same gating + audit).
- **From a Slice 1 or 2 result, offer both**: after a bill is read, if a due date was found, offer "also add a reminder to the calendar?" — so one upload can produce a contact *and* an event, each separately confirmed and saved. (This is the payoff of building the pipeline generically in Slice 1.)
- Recurrence: only propose it, never assume; a wrong recurrence must be one edit to fix or drop.

**Out of scope**
- Auto-creating events without confirmation (violates the core principle).
- Any payment/settlement/finance integration — this is a *reminder*, not a ledger.

**Verification**
1. Bill with a clear due date → event pre-filled on the right date → Save → appears on the property + unified calendar.
2. Recurring bill → recurrence proposed, editable, correct after Save; declining recurrence yields a one-off.
3. One upload, two records — contact (Slice 1) **and** event, each confirmed separately, each with its own revision.
4. No due date found → no event offered (no empty/garbage event).
5. Abandon → zero events created. Guest blocked. Secret hygiene holds.

---

## Reviewer sign-off (I check these on every slice)
- [ ] Extraction never writes — all persistence goes through existing gated actions with `recordRevision`.
- [ ] `ANTHROPIC_API_KEY` is server-scoped, never `NEXT_PUBLIC_`, never in a client bundle, never logged.
- [ ] Guest lockout on both the entry point and the `extractIntake` action.
- [ ] No privileged property field (status/max_guests/peak/hero) is ever a proposed value.
- [ ] Abandoning review creates zero rows.
- [ ] Source-file bucket is private + signed-URL only (account/policy numbers are sensitive).
- [ ] Per-extraction cost is measured and recorded in the slice's Implementation section.
- [ ] Copy follows house style (Title Case buttons "Add from a Photo" / "Save", no em-dashes, sentence-case body).

## Implementation

### Slice 1 — property details from a bill (built 2026-07-30)

**Key files**

| File | What it is |
|---|---|
| `supabase/migrations/20260730000001_smart_intake.sql` | Private `intake` bucket + RLS, and the `intake_documents` provenance table |
| `src/lib/intake/schema.ts` | Browser-safe: intent schema, upload guardrails, path helpers, and the validator that coerces model output into the review form's shape |
| `src/lib/intake/extract.ts` | Server-only Claude vision wrapper. Reads `ANTHROPIC_API_KEY`, writes nothing |
| `src/app/(app)/properties/[slug]/edit/intake/actions.ts` | `extractIntake` Server Action: gating, download, extract, provenance row |
| `src/app/(app)/properties/[slug]/edit/intake/page.tsx` | Guest-blocked route; renders the not-set-up state when no key is configured |
| `src/app/(app)/properties/[slug]/edit/intake/intake-flow.tsx` | Upload → read → review → save client flow |
| `src/components/intake/review-shell.tsx` | Reusable `ReviewShell` / `ReviewSection` / `ReviewField` surface for slices 2 and 3 |
| `supabase/tests/prd32-smart-intake.sql` | RLS checks: guest insert/read blocked, misattributed upload blocked, bucket private |

**Decisions made during the build**

- **Provider path: the Anthropic SDK directly** (`@anthropic-ai/sdk`), not the Vercel AI Gateway. The repo has no `ai` package and no Vercel CLI installed, so the SDK is one dependency instead of two plus a gateway configuration. The whole call is behind `extractContactFromDocument()`, so swapping to the Gateway later is one function body.
- **Model: `claude-sonnet-5`**, per the PRD's pre-flight recommendation of Sonnet-class vision, overridable with `INTAKE_MODEL` without a code change. Run at `effort: "low"` — the job is transcription, not reasoning, and low effort keeps "reading your document…" a short wait.
- **Structured output via `output_config.format` (JSON schema), not tool-use.** Same guarantee that the model must return the schema, without a tool-call round trip to unwrap. Every field is required, and "not on the page" is a null `value` rather than a missing key, so the review form never has to reason about absence.
- **Confidence is per field and honest by instruction.** The prompt tells the model that a person reviews every field, so an honest "low" beats a confident guess. The UI flags anything below `high` with "Please check" / "Hard to read, please check" and never hides or withholds a value on that basis.
- **The address fill carries the whole property forward.** `updateProperty` writes every field it reads, so an address-only save would blank the description. The address form ships the current values of `name` / `location` / `description` / `how_to` / `guidelines` / `amenities` as hidden inputs, plus `status` and `max_guests` when the member can manage the property (the action preserves those two only for members who *can't* change them). `peak_period_ranges` is genuinely optional and is left out. This is the sharpest edge in the slice — see the follow-up below.
- **Address is offered, never assumed.** Only when the bill clearly shows one *and* the property has no address. An address a person typed is never overwritten.
- **Photos are downscaled in the browser** with the existing `prepareImageForUpload`, so a 9MB phone original becomes a sub-1MB JPEG before upload. PDFs pass through untouched.
- **HEIC is rejected at the picker** with a plain-language message rather than failing server-side. iOS converts to JPEG on upload in practice, so this should stay rare.
- **Provenance is property-scoped, not record-scoped.** `intake_documents` records that a document was read for a property, by whom, and when. Linking a row to the *specific* contact it produced would mean touching `addPropertyContact`, which the no-new-write-path rule forbids.

**Cost (measured 2026-07-30)**

The wrapper logs `[intake] extraction complete: <in> / <out> tokens, ~$<usd>` per extraction — tokens and estimate only, never the document or the extracted values. Rates are keyed by model so the log stays honest if `INTAKE_MODEL` changes.

**As shipped (Haiku 4.5, 1500px): about $0.004 per document, ~5s.** Across the 48-extraction eval its mean was $0.0042 / 4.9s. Dad photographing his whole backlog of 200 documents costs under a dollar.

Getting there took two corrections to the first estimate:

| Step | Cost per document |
|---|---|
| First measurement (Sonnet 5, 2048px JPEG) | $0.0258 |
| Drop the image cap to 1500px | $0.0200 |
| Switch to Haiku 4.5 after the eval | **$0.0042** |

The original pre-build guess of "low single-digit tenths of a cent" was wrong for the right reason: a page renders to image tokens roughly regardless of file size, so the cost floor is set by pixel area and by the output length, not by how big the upload is.

**Cost investigation (2026-07-30).** Same bill run across models and resolutions, against the extraction wrapper directly (no app, no writes):

| Model | Input | Tokens in/out | Cost | Accuracy |
|---|---|---|---|---|
| Sonnet 5 | JPEG 2048 (original path) | 6259 / 468 | $0.0258 | all correct |
| Sonnet 5 | JPEG 1500 | 4309 / 472 | **$0.0200** | all correct |
| Sonnet 5 | JPEG 1000 | 3049 / 448 | $0.0159 | all correct |
| Sonnet 5 | JPEG 750 | 2608 / 463 | $0.0148 | all correct |
| Sonnet 5 | PDF | 3874 / 465 | $0.0186 | all correct |
| Haiku 4.5 | JPEG 2048 | 3204 / 273 | **$0.0046** | all correct |
| Haiku 4.5 | PDF | 3469 / 262 | $0.0048 | all correct |

Two findings, one acted on and one deliberately not:

1. **Resolution was free money, so the cap dropped to 1500px** (`INTAKE_MAX_DIMENSION`). The upload was being downscaled to the photo archive's 2048, which is sized for viewing photos, not for reading a page once. 1500px cut the image path from $0.026 to $0.020 with identical extraction. 1000px and below also read this bill correctly but leave no headroom for the harder inputs the feature exists for (handwriting, creases, angled photos), so 1500 is the balance. Verified end-to-end after the change: 4309 input tokens, every field still correct.

2. **Haiku 4.5 was rejected on one sample, then the rejection was overturned by a proper eval.** The initial call was made on a single degraded image where Haiku reported `high` confidence on a phone number it got wrong. A 96-extraction eval over six documents and four degradation levels ([evals/intake](../evals/intake/README.md)) did not reproduce that as a pattern — see the model-choice section below.

Also fixed while measuring: `output_config.effort` was hardcoded, and **Haiku rejects that parameter with a 400**, so `INTAKE_MODEL` could not actually point at a cheaper model. Now sent only for models that support it (`supportsEffort`).

**Model choice, settled by eval (2026-07-30).** Harness and full results in [evals/intake](../evals/intake/README.md). 6 documents (3 synthetic US bills with exact ground truth, 3 real public-domain scans that carry no phone or email at all) × 4 degradation levels × 2 runs × 2 models = 96 extractions.

At realistic photo quality the two models are indistinguishable on accuracy:

| | correct | restraint | missed | fabricated | cost | latency |
|---|---|---|---|---|---|---|
| Sonnet 5 | 68% | 29% | 0% | 3% (4) | $0.0175 | 6.4s |
| Haiku 4.5 | 68% | 29% | 1% | 1% (2) | **$0.0042** | 4.9s |

All six "fabrications" on both sides were misspellings of one cursive surname on the 1860 handwritten bill (Belair / Bilain / Bellenir / Bellew for "Belain") — near-misses, not inventions. **Neither model invented a phone number or an email address once in 36 opportunities** on documents that had none.

The `brutal` condition (420px, heavy blur — past any real upload) found where they break, and the result argues *for* Haiku rather than against it: Sonnet fabricated more (25% vs 19%) and, more importantly, fabricated **plausibly** — "415 Loon Lake Road" against a true 418, "$212.46" against $213.46, "(207) 555-0189" against 555-0184. Those survive a skim. Haiku's failures were obvious ("Sugarville, MN"), and it declined to answer far more often (42% missed vs 17%). Even there, neither invented a phone or email on the documents that had none.

The one real difference is that Sonnet's confidence signal carries more information: it used `medium`/`low` on 34% of fields against Haiku's 4%. But Sonnet over-flags — 43 `low` ratings, only 1 of them actually wrong — so a third of fields on a clean bill would show "Please check", which is how a flag becomes noise and gets ignored. Haiku marked one wrong value `high` (1 of 138).

**Conclusion: the original rejection was not supported.** Haiku 4.5 is 4.2x cheaper, faster, equally accurate at realistic quality, and fails more visibly at unrealistic quality. **Shipped as the default**, with `INTAKE_MODEL` set to it in Vercel and locally as well. Revisit when slice 2 lands — the handwriting evidence rests on a single document and is the thinnest part of the corpus.

Not pursued: trimming the `rawText` cap to cut output tokens. Output is ~460 tokens (~$0.007) and rawText is the "show what we read" disclosure that makes a bad extraction auditable. Saving ~$0.002 by degrading that trade is the wrong side of the deal.

**Verification status**

Passing: build clean, typecheck clean, lint clean. Secret hygiene verified by scanning `.next/static` after a production build for `ANTHROPIC_API_KEY` / `anthropic` — no hits, so the key and the SDK never reach a client bundle. Privileged fields are unreachable by construction: `parseContactExtraction` drops every key outside `CONTACT_FIELD_KEYS`, so status / max_guests / peak / hero can't be proposed. Guest lockout is enforced at three layers (route `notFound`, `extractIntake` rejection, RLS).

Migration applied to the remote database 2026-07-30 via `supabase db push`. The RLS checks then ran green against it (all 10): member insert allowed; guest insert blocked 42501; a member attributing an upload to someone else blocked 42501; member reads the trail, guest reads zero; guest reads zero objects in the `intake` bucket; bucket `public = false`; 3 table policies, 3 storage policies, RLS enabled. Everything ran inside one transaction that was rolled back, so no fixtures persisted. Note `psql` wasn't available, so these were driven through the repo's `postgres` client rather than `supabase/tests/prd32-smart-intake.sql` directly — the checked-in SQL file mirrors them and is still worth running on a machine with `psql` (its T4 expects 1 where the scripted run expected 2, because the SQL version rolls back its own insert first).

**Live run against the real vision call, 2026-07-30** (localhost dev server, production Supabase, signed in as Dan). Two synthetic documents: a clean one-page PG&E-style PDF, then the same page rendered down to a 201×260 quality-15 JPEG to force a bad read.

| PRD case | Result |
|---|---|
| 1. Happy path | **Partial.** Read cleanly: label "Electric utility" (the kind, not the company, as prompted), name "Pacific Gas & Electric Company", phone, email, and notes carrying account number + billing period + amount due on one line. The Save step was deliberately not exercised — see below. |
| 2. Address fill | **Offered correctly.** It returned the *service* address (418 Loon Lake Road, Rangeley ME) and not the vendor's Sacramento PO Box, which is the discriminating case the prompt targets. The section appeared because the property has no address. Accept not exercised. |
| 3. Bad read is editable | **Passed, and the most informative run.** All five fields flagged: two "Please check" (medium), three "Hard to read, please check" (low). Email correctly came back null rather than invented. Notes were hedged and wrong ("around Jul 21-Aug 20; approx $149.30" against an actual Jun 10-Jul 9 / $164.38) — flagged low, which is exactly the case review-before-save exists for. No address was offered, so a shaky read produced no garbage address section. |
| 4. No silent writes | **Passed.** After both extractions: 0 contacts, 0 revisions, property `address` still null. Only the provenance row and the stored file, as designed. |
| 5. Guest blocked | **Passed** at the RLS layer (above); route and action gates verified by reading. |
| 6. Privileged fields untouched | **Passed** by construction (schema whitelist) and confirmed in the rendered form: only label/name/phone/email/notes/address inputs exist. |
| 7. Secret hygiene | **Passed.** No `ANTHROPIC_API_KEY` or `anthropic` reference in `.next/static`. |

Both test documents and their provenance rows were deleted afterwards; production is back to zero intake rows and zero intake objects. The storage delete was performed through the app's own owner-delete policy, which incidentally verifies that policy too.

**One behaviour worth watching:** on the degraded image the model still produced the correct PG&E customer-service number, almost certainly by pattern-completing a well-known value rather than reading it. It was flagged low, so the design holds, but it's a reminder that a confident-looking familiar value can be a guess. Nothing to fix; worth knowing.

**Save path — walked live by the reviewer post-merge (2026-07-30, production, signed in as Dan).** The one gap the build left open is now closed. On the real deployment, on `Loon-A-See`:
- **Save Contact passed.** A synthetic Lakeshore Water District bill read cleanly (label "Water utility", name, phone, email, notes = account + period + amount on one line), Save landed the contact on the property, and a fresh reload confirmed all five fields persisted. `addPropertyContact` runs `recordRevision` in the same call, so the revision was written too.
- **Save Address passed, and preserved every other field.** The service address ("27 Birch Hollow Road", correctly chosen over the vendor's PO Box) saved via the hidden-input round-trip, and a fresh reload confirmed **Location, Description, Status (Active), Max guests, and the 06-01 → 08-31 peak window were all untouched** — the coupling in the follow-up below is correct in practice, not just in theory.
- **Cleanup:** because this ran on a real property, the test address was cleared back to empty and the test contact deleted (via the PRD-30 confirm dialog); the property is fully restored. Not cleaned: the one intake source object + `intake_documents` row the extraction left behind — there's no UI to remove those yet, which is exactly the retention follow-up below.

**Follow-ups**

- ~~The address form's hidden-field set is coupled to `updateProperty`'s reads.~~ **Closed in slice 2** by `PropertyCarryFields`, which owns the carry set in one place for all three intake forms.
- Source documents are never garbage-collected. A member who abandons review still leaves a file in the bucket and a row in `intake_documents`. Fine at family scale; wants a retention story eventually.
- ~~`intake_documents` has no UI.~~ **Partly closed in slice 2**: the review screen now links to the uploaded document via a 30-minute signed URL. There's still no way to browse or delete past uploads.
- One extraction per upload, no retry. If real-world reads turn out to be flaky, a member-triggered "Read It Again" is the right shape, not an automatic retry.

### Slice 2 — handwritten notes → property notes / free-form (built 2026-07-30)

**What shipped.** The intake page now opens with a choice: *A bill or statement* or *A handwritten note*. The note path transcribes the page, shows the transcription as the hero of the review screen next to a link back to the photo, and offers three kinds of destination the member routes by hand: `properties.guidelines`, `properties.how_to`, and any people the note names with a number. Each destination saves separately through its own existing gated action, with its own revision. Nothing auto-routes.

**Key files**

```
src/lib/intake/schema.ts                             # + note intent: types, JSON schema, prompt, parseNoteExtraction
src/lib/intake/extract.ts                            # generalised to extractFromDocument({intent}); INTENTS registry
src/app/(app)/properties/[slug]/edit/intake/
  actions.ts                                         # + intent arg, + short-lived signed URL for the source document
  intake-flow.tsx                                    # kind picker; one file input per kind; dispatches by intent
  note-review.tsx                                    # NEW — transcription panel + routed destinations
  contact-review.tsx                                 # NEW — slice 1's forms, moved out of intake-flow
src/components/intake/property-carry-fields.tsx      # NEW — the updateProperty carry set, in one place
src/components/intake/review-shell.tsx               # + sourceUrl link
evals/intake/make-notes.py, eval-notes.mts           # NEW — note-intent eval + corpus
evals/intake/results-notes-2026-07-30.md             # NEW — results
```

**Decisions made during the build**

- **Existing prose is merged into the box, not appended behind a mode toggle.** Where a property already has guidelines, the textarea opens with the existing text plus the new lines underneath. There is no hidden "append or replace" choice: what the member sees in the box is exactly what saves, which is the only version safe to press Save on without reading the small print.
- **A suggested contact must have a phone number or an email.** Enforced in `parseNoteExtraction`, not just asked for in the prompt. This came directly from the eval — see below.
- **The "please check this" warning on a note is unconditional**, not confidence-driven, because measurement showed the confidence signal doesn't discriminate on this intent.
- **`PropertyCarryFields`** replaces slice 1's hand-rolled hidden inputs and is now the single place that has to track `updateProperty`'s field list. Slice 2 would otherwise have been the third copy.
- **One file input per kind card.** The first cut shared one input and set the intent in state just before clicking it; giving each card its own input makes the choice travel with the file instead of through state set a moment earlier.
- **No `rawText` on the note schema.** The transcription *is* the raw read, so asking for both would pay twice for the same tokens and give the member two texts to reconcile.

**Cost.** ~$0.004 per note and ~4.4s on `claude-haiku-4-5` — the same as slice 1's bill reading.

**The eval caught two things that would have shipped** (full write-up: [evals/intake/results-notes-2026-07-30.md](../evals/intake/results-notes-2026-07-30.md))

1. **The note intent was entirely broken.** All 30 extractions failed with a 400: structured outputs reject `maxItems` on an array. The contact schema has no arrays, so slice 1 never hit it. Without the eval this would have shipped as a feature that failed on every upload.
2. **Contacts were being invented off unreachable names.** On the 1860 handwritten bill the model returned confident contacts named "Trumlodge", "Brimblade", "Bellamy" — four readings of one surname across runs, off a document with no phone number anywhere. Requiring a phone or email took that from 33% fabricated to 100% restraint.

**Results after both fixes: zero fabrications in 126 scored fields.** Transcription 24/24, contact phones 24/24 digit-exact, no misses, and no degradation between clean / phone / poor photos. The 12 remaining "misroutes" are real lines filed under the other heading ("Ruth has the spare key" as a how-to rather than a guideline) — arguable both ways, visible and editable before saving.

**The confidence signal does not work on this intent.** All 126 fields came back `high`, including while the model read the same name four different ways. After the fixes none of those are wrong, so it's uninformative rather than misleading, but the review screen deliberately does not depend on it: the "check this against the photo" warning always renders, and the phone field always carries the "handwritten numbers are easy to misread" hint. A flag that never fires is worse than no flag, because its absence reads as reassurance.

**Verification status**

Typecheck, lint, and production build clean. Secret hygiene re-verified: no `ANTHROPIC_API_KEY` or `@anthropic-ai` reference in `.next/static`.

**Live run, 2026-07-30** (localhost dev server, production Supabase, signed in as Dan), uploading a degraded handwritten note through the note path:

| PRD case | Result |
|---|---|
| 1. Legible note → clean transcription, sensible destinations | **Passed.** Full transcription rendered; guidelines got "No shoes upstairs / Strip the beds", how-to got the water shut-off and gate code. Both boxes opened with the property's existing text preserved above the new lines. |
| 2. Note naming a person + phone → contact offered | **Passed.** "Plumber / Jim Farrow / 207-555-0143", digit-exact, bound to the unchanged `addPropertyContact`. |
| 3. Messy handwriting still editable, flags visible | **Passed.** Warning renders unconditionally; every destination is a normal editable field. |
| 4. Abandon → zero writes | **Passed.** After the extraction: 0 contacts on the property, and zero revisions written after the extraction timestamp. |
| 5. Source document link | **Passed.** The signed URL returns the image (200); the same object unsigned returns 400, so the bucket is still private. |
| 6. Guest blocked | Unchanged from slice 1 — same route gate, same action check, same RLS, all verified there. Slice 2 adds no new entry point. |
| 7. Secret hygiene | **Passed.** |

**Not cleaned up:** the storage object from this test was deleted through the app's own owner-delete policy, but its `intake_documents` row is still present — the delete was blocked by a local permission guard. One orphaned row (`intent = 'note'`, storage path `b2/b2c1e714-…`), plus the `contact` row the reviewer's slice 1 walk left. Both are harmless provenance rows pointing at deleted objects, and both are the retention follow-up below made concrete.

**Follow-ups**

- Retention/GC for the `intake` bucket and `intake_documents` is now overdue: three test rows across two slices, no way to see or remove them in the app.
- The `guidelines` vs `how_to` split is a judgement call the model gets right about 80% of the time and the member fixes in a second. If it annoys anyone, the fix is one screen showing both boxes side by side rather than a better prompt.
- Confidence calibration on the note intent is worth re-testing whenever the prompt or model changes; today it's uniformly `high` and carries no information.
