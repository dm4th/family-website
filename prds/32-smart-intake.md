# 32 — Smart Intake (Photo → Pre-filled Property & Calendar Details)

**Phase**: 7 (authoring assist) · **Depends on**: 03 (properties + `property_contacts` + `canManageProperty`), 05 (Supabase Storage upload), 06 (bookings/calendar + `events`), 27 (direct-write posture — AI never writes, only pre-fills)
**Status**: 🚧 slice 1 in review (2026-07-30) — slices 2 and 3 still 🟢 ready. **New dependency: server-side Claude vision (Anthropic API key).**
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

**Cost**

The wrapper logs `[intake] extraction complete: <in> / <out> tokens, ~$<usd>` per extraction — tokens and estimate only, never the document or the extracted values. At Sonnet-5 rates ($3/$15 per Mtok) a downscaled single-page bill should land in the low single-digit tenths of a cent. **Not yet measured against a real document** — no `ANTHROPIC_API_KEY` was configured at build time. Record the first real numbers here.

**Verification status**

Passing: build clean, typecheck clean, lint clean. Secret hygiene verified by scanning `.next/static` after a production build for `ANTHROPIC_API_KEY` / `anthropic` — no hits, so the key and the SDK never reach a client bundle. Privileged fields are unreachable by construction: `parseContactExtraction` drops every key outside `CONTACT_FIELD_KEYS`, so status / max_guests / peak / hero can't be proposed. Guest lockout is enforced at three layers (route `notFound`, `extractIntake` rejection, RLS).

**Not yet run** (both need environment Claude didn't have): the migration has not been applied to any database, so `supabase/tests/prd32-smart-intake.sql` is unexecuted; and the happy path, the address fill, the bad-read path, and the abandon-writes-nothing path all need a real key and a real bill. Dan's steps, in order: set `ANTHROPIC_API_KEY` in Vercel (server scope, never `NEXT_PUBLIC_`), `supabase db push`, then run the SQL test file and walk the seven PRD verification cases.

**Follow-ups**

- The address form's hidden-field set is coupled to `updateProperty`'s reads. If that action gains a field, this form silently starts blanking it. Worth a narrower `updatePropertyAddress` action, or a shared "current values" helper both forms use.
- Source documents are never garbage-collected. A member who abandons review still leaves a file in the bucket and a row in `intake_documents`. Fine at family scale; wants a retention story eventually.
- `intake_documents` has no UI. The rows are written and readable but nothing surfaces "re-open the original" yet. Slice 2 is the natural home for that, since re-reading a handwritten note is exactly when you want it.
- One extraction per upload, no retry. If real-world reads turn out to be flaky, a member-triggered "Read It Again" is the right shape, not an automatic retry.
