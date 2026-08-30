# 40 — Trust Document Vault & Security Foundation

**Phase**: 3 (Advisory) · **Depends on**: nothing to build; **unblocks** [07 — Trust-doc RAG](07-trust-doc-rag.md) and (partially) [08 — Financial dashboard](08-financial-dashboard.md)
**Status**: 🚧 grid signed off by Dan 2026-08-30 · **slice 1 (the vault) built same day — migration NOT yet applied to prod, negative suite NOT yet run**. Slices 2 (inferred taxonomy) and 3 (notebook intake) not started. See Implementation below.
**Parallel-safe with**: most feature PRDs (new bucket, new tables, new `/advisory` routes; touches no existing surface except nav).

---

## Why this exists

Three things came together (conversation with Dad, 2026-08):

1. **Dad is about to share the site with the trust's main adviser and accountant** — the first non-family users who need to see Advisory content, and only Advisory content.
2. **The trust documents currently live in a secure Dropbox container Dad wants to move out of.** They need a new home that is at least as secure and that a Claude-SDK agent can read from without a third-party OAuth surface.
3. **Dad holds a notebook of handwritten notes about the trust** (notes provided to him over the years). Those need a way in: photograph or scan pages, OCR them, pull out the key points, map them back to the digital documents, and have a human approve or deny every extracted point and mapping before anything is treated as true.

PRDs [07](07-trust-doc-rag.md) and [08](08-financial-dashboard.md) have been 🔴 blocked on exactly this security decision since the first slice. The posture here is deliberate: **get the vault, access model, and audit trail right first**, so the adviser agent (07) is built on a foundation that was secure from day one rather than hardened after the fact.

## The two questions, answered

### 1. Where should the documents live?

**Recommendation: Supabase Storage — a new private `trust` bucket in the existing project — with a default-deny, explicit-grant access model and an append-only audit log.** Move the documents out of Dropbox and into this vault; Dropbox retention of the originals is Dad's call (grid below).

Why this beats the alternatives:

| Option | Verdict | Reasoning |
|---|---|---|
| **Supabase Storage, private bucket (recommended)** | ✅ | Already encrypted at rest (AES-256) and in transit; SOC 2 Type II. Sits behind the **same auth + RLS regime as everything else on the site** — which is the real security win: access rules live in one place, in SQL, testable with the negative-suite pattern that has caught real holes here before (PRDs 25, 26, 32). Claude reads it server-side through the user's own session with no new vendor, no new OAuth grant, no new key. The `intake` bucket already holds account and policy numbers under this exact posture. |
| Stay in Dropbox, read via Dropbox API | ❌ | The opposite of what Dad asked for, and structurally worse: a Dropbox OAuth token scoped to that folder is a **standing credential living in our server env**, outside RLS, invisible to our audit trail. Two permission systems that can drift apart. |
| AWS S3 + KMS (customer-managed keys) | ❌ for now | Real benefit is customer-controlled key rotation/revocation and bucket-level IAM. Cost: a second cloud vendor, IAM policy surface we don't currently maintain, and **no integration with the site's auth** — we'd be rebuilding per-user access control in application code, which is exactly the layer RLS exists to keep us out of. Not proportionate for a family trust; revisit only if the lawyer demands customer-managed keys. |
| Self-hosted (MinIO etc.) | ❌ | Removes a vendor by making us the vendor. An unpatched self-hosted store is far more likely to be the breach than Supabase is. |

**The honest limit, stated plainly so nobody is surprised later:** any AI that reasons over a document must read it in plaintext at inference time. "End-to-end encrypted such that the server can never read it" and "an agent can reason over it" are mutually exclusive. So the design goal is not zero plaintext exposure — it's **minimum plaintext surface**: encrypted at rest, decrypted only transiently inside a server action or agent turn running as an authenticated, authorized user, sent to the Anthropic API under commercial terms (API inputs/outputs are **not used for model training**; a zero-data-retention arrangement is the upgrade path if the lawyer wants it in writing), and never cached, logged, or persisted in decrypted form anywhere else.

**The access model (the part that matters more than the bucket):**

- **Default deny, even for members.** Unlike every other surface on the site, trust documents are not family-wide reading. Read access requires an explicit per-person grant: a `trust_document_access` row per (document, profile). No `not is_guest()` shortcut anywhere in these policies — the adviser and accountant *will be* guest-role accounts, and family members without a grant get nothing.
- **A named managers table, not `is_admin()`.** Site admin means "runs the website," not "reads the trust." A `trust_managers` table (Dad, Dan to start) gates upload, grant management, and scan approval via a `is_trust_manager()` SQL function, same shape as `is_admin()`/`is_property_admin()`. Site admins can be added as managers; they don't inherit it.
- **Append-only audit log.** `trust_document_events` records every consequential act — upload, view (each signed-URL issuance), download, grant added, grant revoked, agent read, scan approved/denied — with actor, document, and timestamp. RLS: insert-only (no update or delete policies for anyone), readable by trust managers. Every signed URL is issued by a server action that writes the event row first; short TTL (minutes, not the 30-minute intake default).
- **The agent goes through the same door.** The Claude-SDK adviser (07) runs server-side, per-request, **as the signed-in user, through that user's RLS session**. It holds no service-role key (this repo has deliberately never used one — PRD 26 chose an admin-guarded RPC over it; keep that record intact). Structurally, the agent cannot retrieve a document its user couldn't open by hand, and every retrieval lands in the audit log attributed to that user. This was already flagged as the central risk for PRD 23 ("wrapping server actions without re-checking authz"); here it's the founding constraint.
- **Adviser + accountant get guest-role accounts + explicit grants.** No fourth role. The existing `guest` role already means "scoped outsider"; trust RLS keys off `trust_document_access` and `trust_managers`, never off role, so a guest with grants sees exactly the granted documents and an ungranted member sees none. (Route gating detail: `/advisory/*` pages check grants, and the guest middleware allowlist grows those routes — build-time detail, flagged in the layout below.)

### 2. How do the notebook notes get in?

**Recommendation: reuse the Smart Intake architecture (PRDs 32–34) — photograph → private storage → Claude vision OCR → transcription-first review → human approves or denies every item — with the trust-grade access model above and one new concept: proposed mappings back to the digital documents.**

This pipeline is the most battle-tested thing in the codebase: three shipped PRDs, per-slice evals that caught real shipping bugs (a fabricated contact, a wrong-year date, a 400 that would have broken every upload), and a standing non-negotiable that fits this feature exactly: **AI proposes, a human confirms, gated actions save.** Nothing extracted from a scan becomes part of what the adviser agent treats as true until a person has approved it.

The flow:

1. **Upload** — Dad photographs or scans notebook pages (the existing `PhotoUpload` direct-to-Storage path, into the `trust` bucket as `kind: scan`). Scans are trust documents: same grants, same audit rows.
2. **OCR + extraction** — a new `trust_note` intent in the existing intent registry (`src/lib/intake/extract.ts` pattern): verbatim transcription first (uncertain words marked, never silently guessed), then key points, each with a confidence level.
3. **Mapping proposals** — for each key point, the model proposes zero or more links to specific digital documents ("this note about the distribution schedule appears to refer to Article IV of the 2019 restatement"), citing document + page. Requires page-level text extraction of the digital docs at upload time (a `trust_document_pages` table). Deliberately **no embeddings here** — plain text search + the model reading candidate pages is enough at this corpus size; pgvector arrives with PRD 07 and reuses the same extracted text.
4. **Review window** — a transcription-first review screen (the slice-2 pattern: original image side-by-side with the transcription, signed link to the scan). Every key point and every proposed mapping is individually **Approve / Deny**; nothing is all-or-nothing. Edits allowed before approval (fixing OCR of handwriting is expected, and cheaper than re-running).
5. **Approved facts become first-class records** — `trust_annotations` rows: the point text, source scan + page, linked document + page (if mapped), who approved, when. Denied proposals are kept as denied so a re-run doesn't re-propose them. The adviser agent's corpus is: the documents + **approved** annotations. Never raw OCR.

Model note: the intake eval chose Haiku for bills, but its handwriting evidence was explicitly thin ("rests on a single document"). Trust notes are exactly that case — budget a real handwriting eval and expect this intent to land on Sonnet; a notebook is a one-time corpus, so per-page cost is irrelevant next to transcription fidelity.

## Pre-flight decision grid (needs Dan + Dad sign-off)

The seven open questions from PRD 07's grid, now with concrete recommendations — plus the new ones this feature raises:

| Decision | Recommendation | Notes |
|---|---|---|
| **Docs at rest** | Supabase Storage, private `trust` bucket, default-deny RLS | See comparison above. Revisit S3+KMS only on lawyer's demand. |
| **App-layer envelope encryption** (encrypt objects with a server-held key before upload) | ✅ **Decided 2026-08-30: defer, keep the door open** | Protects against a Supabase-storage-layer breach or a misconfigured policy, at the cost of losing signed URLs (all bytes proxy through our server) and a key-management burden. Store objects under a per-document path scheme that doesn't leak names (UUID paths, real names only in the DB row) so this can be added later without re-uploading. Put the question to the lawyer explicitly. |
| **LLM + data terms** | ✅ **Decided 2026-08-30: standard commercial terms, full stop** (no training on API data) | Dan's call: the lawyer conversation will never demand ZDR — dropped from the open list entirely. Already the vendor (`ANTHROPIC_API_KEY` in Vercel since PRD 32). No new vendor surface. |
| **Who reads a document** | Explicit `trust_document_access` grant only — members included | The one place on the site where family membership grants nothing by default. |
| **Who manages** (upload, grant, approve) | ✅ **Decided 2026-08-30: Dad + Dan** | Not `is_admin()`. Managers implicitly read everything; every grant change is audited. |
| **Adviser + accountant accounts** | Existing `guest` role + grants, invited via the PRD 24/39 invite flow | No fourth role. Needs the guest-route allowlist widened for `/advisory/*`. |
| **Who approves scans** | ✅ **Decided 2026-08-30: any trust manager, uploader included** | Two-person approval (uploader ≠ approver) was considered and declined at N=2 managers — it would make Dad wait on Dan for every page. Flip later by policy, not schema, if the lawyer wants it. |
| **Audit requirements** | `trust_document_events`, append-only, manager-readable; every read logged | Sign-off question for the lawyer: any retention minimum for the log itself? |
| **Dropbox originals** | ✅ **Decided 2026-08-30 (Dan): keep Dropbox as a frozen cold backup** | The vault becomes the working copy; nothing new goes to Dropbox. The container stays untouched as a second copy. Note: Dad has said he wants out of Dropbox entirely — worth confirming with him that "frozen backup" (vs. delete-after-verification) matches his intent; deleting later is a one-way door he can take any time. |
| **Taxonomy** | ✅ **Decided 2026-08-30: inferred, not predefined.** Documents upload uncategorized; once the corpus is in, an AI pass **proposes** a taxonomy + per-document assignments, and a manager approves/edits before anything is applied | Kills the "taxonomy conversation with Dad" blocker — the documents themselves answer it. Categories are **data (`trust_categories` rows), never a hard-coded enum**, because Dan wants this see-the-corpus-first, human-approved-taxonomy pattern reusable for any future family built on this infrastructure. Same posture as everything else: AI proposes, a manager confirms, audited. |
| **Vector DB / embeddings** | **Deferred to PRD 07** — pgvector in Supabase, over the same `trust_document_pages` text this PRD extracts | Nothing in this PRD blocks on it. |
| **"Not legal advice" disclaimer** | Deferred to PRD 07 (no Q&A surface ships here) | Lawyer wording sign-off still required before 07. |

## UI requirements (from Dan, 2026-08-30)

Dad's real workflow is **desktop drag-and-drop out of the Dropbox folder**. The manager surface must be built around that:

- **Two large, visually unmistakable drop zones**, side by side on the manager view: **"Trust Documents"** (PDFs and files — the digital originals) and **"Notebook Pages"** (photos/scans of the handwritten notebook). Labeled in plain words with a one-line description each, so there is never a "which box does this go in?" moment. A file dropped on the wrong zone by type (a JPG on Documents, a PDF on Notebook Pages) should be gently routed or asked about, not errored.
- **Multi-file drop is the primary path** — he will select a batch in Dropbox and drag the lot. Per-file progress, and a clear per-file success/failure list at the end (no silent partial batches).
- Drag-and-drop everywhere a click-to-browse exists (the existing `PhotoUpload` drag idiom, generalized), with the whole zone as the target, desktop-first sizing.
- Older-user bar applies (PRD 29 posture): big targets, calm copy, obvious next step after a drop ("3 documents added. They're listed below.").

## Build slices (each its own session/branch, in order)

1. **Slice 1 — the vault.** Migration: `trust` bucket + `trust_documents` (id, name, storage_path, `category_id` **nullable FK → `trust_categories`** — empty at first, filled by the slice-2 taxonomy pass, never an enum, version, `replaces_id`, uploaded_by, timestamps) + `trust_categories` + `trust_managers` + `is_trust_manager()` + `trust_document_access` + `trust_document_events`, RLS on everything, default deny. `/advisory/documents`: manager upload built around the **two-drop-zone drag-and-drop surface** (see UI requirements), document list filtered by grant (uncategorized at this stage — sorted by name/date), per-document grant management, audited signed-URL open. Page-level text extraction on upload → `trust_document_pages`. Negative suite before anything real is uploaded: ungranted member, granted guest, revoked guest, deactivated account, direct-URL probing.
2. **Slice 2 — inferred taxonomy.** Once the corpus is in: a manager-only "Propose an Organization" action reads document names + first-page text and proposes `trust_categories` + per-document assignments; a review screen approves/edits/denies before anything is applied; approved categories group the document list. Audited. Small slice, but it's the reusable multi-family pattern, so it gets its own review.
3. **Slice 3 — notebook intake.** Scan upload + `trust_note` OCR intent + handwriting eval + the approve/deny review window + `trust_annotations`. Depends on slice 1's pages table for mapping proposals.
4. **Then PRD 07 unblocks** — embeddings + retrieval + the chat/agent surface, over this vault, through the same RLS-as-the-user posture.

**Migration order note:** Dad's real documents go in only after slice 1's negative suite has passed on prod — the same discipline as PRD 24 ("nothing shared with family until this ships + is live-tested").

## Likely file layout

```
supabase/migrations/
  YYYYMMDD_trust_vault.sql            # bucket, tables, is_trust_manager(), RLS, audit

src/lib/trust/
  auth.ts                             # isTrustManager(), canReadDocument() helpers
  audit.ts                            # recordTrustEvent() — the one write path for events
  pages.ts                            # page-text extraction on upload

src/lib/intake/schema.ts              # + trust_note intent (prompt, schema, parser)
src/lib/intake/extract.ts             # registry entry only — pipeline unchanged

src/app/(app)/advisory/documents/
  page.tsx                            # grant-filtered list; manager upload + grants UI
  actions.ts                          # uploadTrustDocument, grantAccess, revokeAccess,
                                      # openDocument (audited signed URL)
src/app/(app)/advisory/notebook/
  page.tsx                            # scan upload + pending-review queue
  review/[id]/page.tsx                # transcription + key points + mappings, approve/deny
  actions.ts                          # extractTrustNote, approveAnnotation, denyAnnotation

evals/trust-note/                     # handwriting OCR eval (required before slice 2 ships)
```

## Verification recipe (slice 1 shape)

1. Manager uploads a PDF → document row + pages rows + `uploaded` event; opens it → `viewed` event, signed URL expires on schedule.
2. Member **without** a grant: `/advisory/documents` shows nothing; direct storage-path and signed-URL-guess probes fail; RLS does the work, not the page.
3. Guest (adviser stand-in) **with** a grant: sees exactly the granted documents, nothing else on the site changes for them; revoke the grant → gone on next load, `grant revoked` event recorded.
4. Audit log: every step above visible to a manager, in order; `update`/`delete` on `trust_document_events` fails for every role at the SQL level.
5. Deactivated-member check (PRD 26 restrictive policy) covers the new tables — verify, don't assume.

## Implementation (slice 1 — built 2026-08-30)

**Key files**

- `supabase/migrations/20260830000001_trust_vault.sql` — the whole security model: private `trust` bucket; `trust_managers` + `is_trust_manager()` (roster writes are `is_admin()` — the bootstrap has to live somewhere, and roster changes are audited); `trust_categories` (empty until slice 2); `trust_documents` (kind `document`/`scan`, `category_id` nullable FK, `uploaded_by` SET NULL so a departed uploader never takes documents with them); `trust_document_access`; `trust_document_pages`; `trust_document_events` (insert + select policies only — append-only at the SQL level); storage policies incl. `can_read_trust_object()` definer fn; PRD-26-style active-only restrictive policies on every new table **and** the trust bucket.
- `src/lib/trust/` — `shared.ts` (browser-safe constants, UUID path scheme per the envelope-encryption door), `auth.ts` (`resolveTrustViewer`), `audit.ts` (`recordTrustEvent`, the one event write path), `pages.ts` (`extractPdfPages` via `unpdf` — new dependency, serverless pdf.js, no network egress).
- `src/app/(app)/advisory/documents/` — `page.tsx` (Advisory/briefing mode; register + notebook + roster + activity digest; RLS shapes every query), `actions.ts` (register / open / grant / revoke / delete / roster), `trust-upload.tsx` (the two drop zones), `document-controls.tsx`, `manager-roster.tsx`.
- `nav-config.ts` — Trust Documents is Advisory's first built page (visible to members; the page explains by-name access and RLS shows non-granted members nothing). `src/lib/supabase/middleware.ts` — `/advisory` added to the guest allowlist (RLS is the guarantee, per that file's standing posture).

**Decisions made during build**

- **Audit-or-abort on writes**: an upload that can't write its `uploaded` event is rolled back (row + object); an open that can't write `viewed` doesn't mint the URL; deletion logs *before* removing (over-log beats under-log). Reads of the log stay manager-only.
- **Open TTL is 5 minutes** (vs. intake's 30): every open is a deliberate, audited act; re-opening costs one click and one more audit row.
- Files route by what they *are*: an image dropped on the Documents zone is filed as a notebook page and the per-file result says so — no wrong-box errors for Dad.
- Scan images go through the existing PRD-17 browser downscale (HEIC → JPEG when decodable), which also feeds slice 3's OCR a readable format. PDFs upload as-is, direct to Storage (PRD 05 body-limit lesson).
- Page text extraction is best-effort at register time; image-only PDFs store empty page rows ("exists but unread" — exactly what slice 3 needs to know).

**Verified**: `tsc`, `eslint`, `next build` green; route `/advisory/documents` builds.

**NOT yet done (owner + reviewer steps, in order)**

1. `supabase db push` — apply the migration to prod (Dan).
2. Seat the managers: Dan (admin) adds Dad + himself on the page's roster panel.
3. **Run the verification recipe / negative suite below on prod** — before any real document is uploaded.
4. First real use: Dad drags the Dropbox folder in.

**Follow-up spotted during build**: tables shipped after PRD 26 (`intake_documents`, `property_reminders`, intake bucket) never got the active-only restrictive policies; queued as its own task.

## Open follow-ups

- Lawyer conversation: envelope encryption, audit-log retention, disclaimer wording (before 07). *(ZDR dropped 2026-08-30 — Dan's call that it will never be required.)*
- ~~Trust-doc taxonomy conversation with Dad~~ — resolved by the inferred-taxonomy decision above (slice 2); no conversation needed, the corpus + an approval pass answers it.
- Confirm with Dad that "Dropbox as frozen cold backup" matches his intent (he originally wanted out entirely; deleting later stays a one-way door he can take any time).
- PRD 08 remains gated on its own scoping conversation (what financial data belongs in-app at all).
