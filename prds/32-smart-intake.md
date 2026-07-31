# 32 — Smart Intake (Photo → Pre-filled Property & Calendar Details)

**Phase**: 7 (authoring assist) · **Depends on**: 03 (properties + `property_contacts` + `canManageProperty`), 05 (Supabase Storage upload), 06 (bookings/calendar + `events`), 27 (direct-write posture — AI never writes, only pre-fills)
**Status**: ✅ slices 1 & 2 shipped ([PR #32](https://github.com/dm4th/family-website/pull/32), [PR #33](https://github.com/dm4th/family-website/pull/33), both merged + reviewer-verified live on prod 2026-07-30). 🚧 slice 3 (calendar reminders) built + walked live on prod 2026-07-31, in review. **Dependency: server-side Claude vision (Anthropic API key), model `claude-haiku-4-5`.** **Slice 3 also adds a `property_reminders` table + migration** — the "existing calendar/event create action" it was specified against did not exist (see its Implementation section).
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

## Slice 3 — Property reminders + calendar events from due dates

> **Scope corrected at build time (2026-07-30).** The original spec said Save routes through "the existing calendar/event create action" — the build-time check the spec required found **no such action exists**. `bookings` is stays-only (start/end dates, guest counts, approval workflow — every calendar surface reads from it and nothing else), and `events` is, despite the name, the Family Legacy Timeline from [PRD 11] (`event_year NOT NULL`, no `property_id` — a utility bill filed there would land on the family history spine). Neither can absorb a due-date reminder. **Dan's call: build a property reminders model first, then the intake half on top.** That ordering preserves the core principle — intake stays a pre-fill over a normal, human-usable, gated feature; the AI never gets a write path of its own.

**What it does.** Two halves, built in order:

**Half A — property reminders (the calendar feature).** A first-class reminders model for property-scoped dates ("Water bill due Aug 15", "Chimney sweep in October"), usable entirely by hand with no intake involved:
- New table (e.g. `property_reminders`): `property_id`, title, date, optional recurrence, optional notes/amount text, `created_by`, timestamps. RLS from day one, matching the wiki posture (members create/edit, guests read only what their property grant allows — mirror how `bookings` scopes).
- A gated create/edit/delete Server Action with `recordRevision()` — the same audit posture as every other write.
- Rendering on the **property calendar**, the **unified `/calendar`**, and the **ICS feed** (`/api/ics/[scope]`). ⚠️ The ICS function is post-PRD-25 security-sensitive: reminders in the feed must respect the same guest-collapse scoping the booking rows do.
- **Production migration required** (the first since slice 1).

**Half B — the intake layer (the original slice 3).** A bill → extract **due date + amount + what it's for** → pre-fill a reminder, with optional proposed recurrence → member reviews → Save through Half A's action:
| Extracted from bill | Field |
|---|---|
| Due date | reminder date |
| "Water bill", vendor | title ("Water bill due, PG&E") |
| Amount due | notes text (not a money column) |
| "monthly", "quarterly", "annual" billing | proposed recurrence (member confirms; default one-off if unsure) |

**In scope**
- Half A in full, as above.
- New `calendar` intent + schema in the intent registry; a reminder review form in the shared review shell; Save routes through Half A's gated action.
- **From a Slice 1 result, offer both**: after a bill is read, if a due date was found, offer "also add a reminder?" — one upload can produce a contact *and* a reminder, each separately confirmed and saved.
- Recurrence: only propose it, never assume; a wrong recurrence must be one edit to fix or drop.

**Out of scope**
- Auto-creating reminders without confirmation (violates the core principle).
- Any payment/settlement/finance integration — this is a *reminder*, not a ledger.
- Reminder notifications/emails (a natural later follow-on via the PRD-14 Resend plumbing, not this slice).
- Touching `bookings` or the Legacy `events` table.

**Verification**
1. **Half A stands alone**: a member hand-creates a reminder → appears on the property calendar, the unified calendar, and the ICS feed; edit + delete work; revision logged; guest sees only reminders for their granted property, and the ICS guest-collapse still holds (re-run the PRD-25 negative check with a guest token).
2. Bill with a clear due date → reminder pre-filled on the right date → Save → appears on all three calendar surfaces.
3. Recurring bill → recurrence proposed, editable, correct after Save; declining recurrence yields a one-off.
4. One upload, two records — contact (Slice 1) **and** reminder, each confirmed separately, each with its own revision.
5. No due date found → no reminder offered (no empty/garbage reminder).
6. Abandon → zero reminders created. Guest blocked. Secret hygiene holds.
7. Migration applied to prod + RLS suite green before the intake half is live-walked.

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
- **The property is re-read from the server after every save** (`refreshIntakeProperty` + `useNotifyOnSave`). Carrying fields solves half the whole-form problem; this solves the other half. See the review fix below.
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

**Review fix: two `updateProperty` forms in one session (caught in review, fixed before merge)**

A note that fills both Guidelines and How-To renders two forms pointed at `updateProperty`. Each carried the values it had *at page load*, so saving the second silently reverted the first, with a "Saved" confirmation on screen for both. Slice 1 never hit it because its pair was an insert plus a single `updateProperty` form; slice 2 is the first time two coexist. It's the same failure family `PropertyCarryFields` exists to prevent, but stale in *time* rather than in *field list*.

Fixed by re-reading the property after any save (`refreshIntakeProperty`, read-only, guest-rejected) rather than having each form report what it wrote. Refetching is the safer shape: a form added later can't reintroduce the bug by forgetting to report a field, because the server is what's being asked. Sibling Save buttons are disabled while the re-read is in flight, so a fast second click can't submit the stale carry values either.

**Verified live** (localhost, production Supabase, on Loon-A-See): before the first save the How-To form carried the page-load guidelines; after saving Guidelines it carried the newly stored text, `\r\n` line endings and all, confirming the value came back from the database rather than from client state. Loon-A-See's guidelines were then restored byte-for-byte to their original value, and `how_to`, `description`, and `location` were never touched.

**Save path — walked live by the reviewer post-merge (2026-07-30, production deploy `ded12a8`, on Loon-A-See).** All three destinations exercised end-to-end with a synthetic handwritten note, in the exact sequence the review bug would have broken:
- **Transcription was word-perfect** — every line, including "plumber → Jim Farrow 207-555-0143". The unconditional "Please check this against the photo" warning rendered, and the source-photo link was present.
- **The reverting sequence passed.** Saved Guidelines ("Saved to Loon-A-See."), then immediately saved How-To. A fresh reload read both fields from the database: guidelines held the original text **plus** all three new rules, how-to held the original **plus** the shut-off / gate code / furnace lines. Pre-fix, the guidelines addition would have been silently reverted; the fix holds in production.
- **Contact saved digit-exact**: Plumber / Jim Farrow / 207-555-0143, with the parenthetical ("call before 4, no weekends") correctly routed into notes.
- **Cleanup:** guidelines and how-to restored byte-for-byte to their originals, the test contact deleted via the confirm dialog, address untouched throughout; a fresh reload confirmed the property back in its original state. The walk's intake source object + provenance row remain (retention follow-up below).

**Follow-ups**

- Retention/GC for the `intake` bucket and `intake_documents` is now overdue: three test rows across two slices, no way to see or remove them in the app.
- The `guidelines` vs `how_to` split is a judgement call the model gets right about 80% of the time and the member fixes in a second. If it annoys anyone, the fix is one screen showing both boxes side by side rather than a better prompt.
- Confidence calibration on the note intent is worth re-testing whenever the prompt or model changes; today it's uniformly `high` and carries no information.

---

### Slice 3 — calendar events from due dates (built 2026-07-30)

**The premise didn't hold, and that changed the shape of the slice.**

Slice 3 was specified as "Save routes through the **existing** calendar/event
create action (unchanged, same gating + audit)". There is no such action. The
PRD flagged this ("confirm exact table + create action at build time") and the
check came back negative:

- **`bookings`** are stays: `start_date`/`end_date`, `guest_count`,
  `requested_by`, a pending/approved/declined workflow. Every calendar surface
  (property calendar, unified `/calendar`, the ICS feed) reads this table and
  only this table. A bill due date is not a stay and has none of those fields.
- **`events`**, despite the name, is the Family Legacy Timeline (PRD 11):
  `event_year` NOT NULL, no `property_id`, rendered as narrative anchors on the
  family history spine. Filing "Water bill due" there would put a utility bill
  on the family timeline.

So the slice became two pieces, in this order: build the reminder model as
ordinary property data a member can add by hand, then let Smart Intake pre-fill
it like any other form. Dan chose this over descoping. **The AI-never-writes
principle is unchanged** — intake is a consumer of `addPropertyReminder`, with
no privileges the manual form doesn't have.

**Key files — the reminder model (part 1)**

- [supabase/migrations/20260730000002_property_reminders.sql](../supabase/migrations/20260730000002_property_reminders.sql)
  — `property_reminders` table, RLS, and `ics_reminders_for_token()`.
- [src/lib/reminders.ts](../src/lib/reminders.ts) — recurrence expansion, pure.
- [src/app/(app)/properties/[slug]/reminders/actions.ts](../src/app/(app)/properties/[slug]/reminders/actions.ts)
  — the gated write path (create / update / delete, each with `recordRevision`).
- [src/components/reminders/reminder-fields.tsx](../src/components/reminders/reminder-fields.tsx)
  — the editable fields, shared by the manual form and the intake review form.
- [src/app/(app)/properties/[slug]/calendar/_components/reminders-panel.tsx](../src/app/(app)/properties/[slug]/calendar/_components/reminders-panel.tsx)
  — list, add, edit, remove on the property calendar.
- [src/lib/use-notify-on-save.ts](../src/lib/use-notify-on-save.ts) — slice 2's
  one-shot save signal, moved out of `property-carry-fields.tsx` (re-exported
  there) now that a second feature needs it.

**Key files — the intake intent (part 2)**

- `calendar` intent added to `INTAKE_INTENTS`, with `CALENDAR_EXTRACTION_*` and
  `parseCalendarExtraction` in [src/lib/intake/schema.ts](../src/lib/intake/schema.ts);
  one more entry in the `INTENTS` registry in
  [src/lib/intake/extract.ts](../src/lib/intake/extract.ts). The pipeline itself
  is untouched from slice 1, as designed.
- [src/app/(app)/properties/[slug]/edit/intake/calendar-review.tsx](../src/app/(app)/properties/[slug]/edit/intake/calendar-review.tsx)
  — the review form.
- [evals/intake/make-bills-dated.py](../evals/intake/make-bills-dated.py) +
  [eval-calendar.mts](../evals/intake/eval-calendar.mts) +
  [results-calendar-2026-07-30.md](../evals/intake/results-calendar-2026-07-30.md).

**Decisions made during the build**

- **Not a ledger.** No amount column, no paid/unpaid state. An amount is free
  text inside `notes`, the way it would be written on a calendar square. PRD 32
  puts payments out of scope and a money column would imply arithmetic we never
  do.
- **Repeats are a rule, not rows.** One recurring reminder is one row, expanded
  on demand. Materializing would mean guessing how far ahead to write and would
  turn "fix the date" into "fix it in eighty places".
- **Month-end clamping, and the feed expands rather than emitting an RRULE.**
  A bill due the 31st has no 31st of February. RFC 5545's monthly rule *skips*
  such months; we clamp to the 28th, because a member who set "the 31st" means
  end of month and a reminder that silently vanishes is worse than one arriving
  two days early. To stop the site and a subscriber's phone applying different
  rules, the ICS feed emits one VEVENT per expanded occurrence over a 24-month
  horizon, from the same function the calendar renders from.
- **Guests see no reminders at all** — stricter than `property_contacts`, which
  a granted guest can read. A contact is "who to call about the boiler"; a
  reminder is "premium due the 15th, $2,400, policy 88-42213". Enforced in RLS,
  and `ics_reminders_for_token` returns early for a guest at any scope rather
  than filtering, so the feed can't become the way around it.
- **One upload, two records** (a PRD in-scope item) is a re-read, not a bigger
  schema: after a bill has been read for its contact details or as a note, a
  button re-reads the *same stored file* with the calendar intent. It costs a
  third of a cent and only when asked, so a member who wanted a phone number
  isn't charged for a calendar form they didn't want. The `intake_documents`
  insert became an upsert (`storage_path` is unique) to allow the second pass.
- **Reminders are drawn as bronze markers, never filled bands.** "The house is
  occupied" and "a bill is due" must not look alike on a calendar square.

**Verification**

- **Recurrence math is checked directly** ([evals/reminders/recurrence-check.mts](../evals/reminders/recurrence-check.mts),
  26 checks): month-end clamping, leap years, windows starting mid-repeat,
  occurrences before the due date, malformed input. It caught a real bug on
  first run — the jump-to-window optimization counted months where it should
  have counted occurrences, so quarterly and annual reminders skipped far past
  the window and returned nothing. Monthly (step 1) hid it.
- **Extraction eval: 36 extractions, ~$0.0033/doc, 3.4s median.** 81% correct,
  14% correct restraint, one missed, **one fabrication**. Restraint was perfect:
  the paid receipt produced zero reminders in all six runs at every photo
  quality (PRD verification #4, measured).
- The fabrication was a **wrong year** (2025 for 2026) on a degraded invoice
  printing `Due: 08/14` with the year only in the statement date. That's the
  worst shape a date error takes: day and month right, so it reads as correct.
  **Mitigation shipped** — the review form flags any proposed date already in
  the past and asks the member to check the year. Flagged, never dropped:
  entering a genuinely overdue bill is a real thing.
- **Confidence is informative on this intent**, unlike slice 2: all 36 "high"
  rows were right and every error fell on a "medium" row. The review form's
  confidence-gated wording is therefore kept, where slice 2's had to be
  unconditional.

**Live walk (2026-07-31, localhost against production Supabase, on Loon-A-See)**

Migration applied to prod by Dan first. Every surface exercised end to end:

- **Hand-added a reminder** due 2026-08-31, repeating monthly, deliberately on a
  month end so clamping ran for real rather than only in the checks.
- **The feed proved the clamping decision.** `/api/ics/loon-a-see` returned 24
  VEVENTs, **no RRULE**, expanding to `20260930`, `20261130`, **`20270228`**,
  and **`20280229`** — February clamped, leap February respected, and the 31st
  recovered every month that has one, with no drift. An RRULE would have skipped
  February entirely. Each event is a valid all-day `DTSTART` + `DURATION:P1D`,
  `TRANSP:TRANSPARENT` so a bill doesn't mark anyone busy.
- **Both calendars** render it as a bronze marker (never a filled band): on the
  property calendar at Aug 31 and the clamped Sep 30, and on the unified calendar
  labelled "Loon-A-See · …".
- **Read a real bill for its due date.** The quarterly water bill pre-filled
  title "Water bill", due 2026-07-20, recurrence `quarterly`, notes
  "$96.20 · Account 4471-B, quarter ending June 30, 2026" — matching the answer
  key. **The past-date flag fired** (that bill was due 11 days before the walk),
  and correctly stayed silent on a second bill dated in the future.
- **RLS holds:** an unauthenticated PostgREST read of `property_reminders`
  returns 401.
- **Cleanup:** all three test reminders removed through the app's own confirm
  dialog; the property calendar, the unified calendar, and the feed all verified
  empty afterwards (the feed needs a cache-busting fetch — it sets
  `private, max-age=300`).

**A bug the walk caught that the checks could not.** The review screen built its
"Saved." confirmation from the *extraction* rather than from what was written, so
editing a misread date before saving produced a confirmation naming the value the
member had just corrected. The database was right the whole time; the message was
wrong. Fixed by returning the written values from the action and rendering from
those — the same "ask the server what happened" reasoning as the slice 2 review
fix. Re-verified by editing both title and date and reading the confirmation back.

**Not covered:** a full guest-session walk. Guest exclusion rests on the RLS
policies, the property calendar's guest branch returning before reminders load,
and `ics_reminders_for_token` returning early for a guest at any scope — all
reviewed but not exercised with a live guest login.

**Follow-ups**

- The walk added 2 more orphaned `intake_documents` rows and 2 storage objects
  (5 rows total across the three slices). Left in place per the standing ruling
  from slice 2. The retention/cleanup follow-up below is now well overdue.
- Recurrence overreach: the property-tax notice was labelled "annually" in 3 of
  12 rows on a page that never says it repeats. Bounded (the form states the
  proposed repeat and how to drop it, and nothing saves unconfirmed) and left
  alone rather than over-fitting the prompt to one synthetic document.
- A reminder has no "done" state, so a one-off in the past simply reads as
  past. If the family wants to tick things off, that's a real feature, not a
  tweak.
- No reminder appears on the property's main page or on the home dashboard yet
  — only on the two calendars and the feed.
- The `intake` bucket retention/cleanup follow-up from slices 1 and 2 still
  stands and is now the oldest open item on this PRD.
