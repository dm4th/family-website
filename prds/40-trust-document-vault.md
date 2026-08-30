# 40 — Trust Document Vault & Security Foundation

**Phase**: 3 (Advisory) · **Depends on**: nothing to build; **unblocks** [07 — Trust-doc RAG](07-trust-doc-rag.md) and (partially) [08 — Financial dashboard](08-financial-dashboard.md)
**Status**: 🟡 recommendation drafted (2026-08-30) — the decision grid below needs sign-off from Dan + Dad (and ideally the family lawyer) before the build slices start. This PRD **is** the "trust-doc security model" conversation the master plan has been gating on.
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
| **App-layer envelope encryption** (encrypt objects with a server-held key before upload) | **Defer, but keep the door open.** | Protects against a Supabase-storage-layer breach or a misconfigured policy, at the cost of losing signed URLs (all bytes proxy through our server) and a key-management burden. Store objects under a per-document path scheme that doesn't leak names (UUID paths, real names only in the DB row) so this can be added later without re-uploading. Put the question to the lawyer explicitly. |
| **LLM + data terms** | Anthropic API under commercial terms (no training on API data); pursue **zero-data-retention** in writing if the lawyer wants it | Already the vendor (`ANTHROPIC_API_KEY` in Vercel since PRD 32). No new vendor surface. |
| **Who reads a document** | Explicit `trust_document_access` grant only — members included | The one place on the site where family membership grants nothing by default. |
| **Who manages** (upload, grant, approve) | `trust_managers` table: Dad + Dan initially | Not `is_admin()`. Managers implicitly read everything; every grant change is audited. |
| **Adviser + accountant accounts** | Existing `guest` role + grants, invited via the PRD 24/39 invite flow | No fourth role. Needs the guest-route allowlist widened for `/advisory/*`. |
| **Who approves scans** | Any trust manager, uploader included | Two-person approval (uploader ≠ approver) is noted as an option; recommend against at N=2 managers — it would make Dad wait on Dan for every page. Flip later by policy, not schema, if the lawyer wants it. |
| **Audit requirements** | `trust_document_events`, append-only, manager-readable; every read logged | Sign-off question for the lawyer: any retention minimum for the log itself? |
| **Dropbox originals** | Dad's call after migration is verified complete | Recommend keeping the Dropbox container frozen (no new docs) until the vault has been live-walked, then deleting on his say-so. |
| **Vector DB / embeddings** | **Deferred to PRD 07** — pgvector in Supabase, over the same `trust_document_pages` text this PRD extracts | Nothing in this PRD blocks on it. |
| **"Not legal advice" disclaimer** | Deferred to PRD 07 (no Q&A surface ships here) | Lawyer wording sign-off still required before 07. |

## Build slices (each its own session/branch, in order)

1. **Slice 1 — the vault.** Migration: `trust` bucket + `trust_documents` (id, name, storage_path, category, version, `replaces_id`, uploaded_by, timestamps) + `trust_managers` + `is_trust_manager()` + `trust_document_access` + `trust_document_events`, RLS on everything, default deny. `/advisory/documents`: manager upload (reusing the direct-to-Storage pattern), document list filtered by grant, per-document grant management, audited signed-URL open. Page-level text extraction on upload → `trust_document_pages`. Negative suite before anything real is uploaded: ungranted member, granted guest, revoked guest, deactivated account, direct-URL probing.
2. **Slice 2 — notebook intake.** Scan upload + `trust_note` OCR intent + handwriting eval + the approve/deny review window + `trust_annotations`. Depends on slice 1's pages table for mapping proposals.
3. **Then PRD 07 unblocks** — embeddings + retrieval + the chat/agent surface, over this vault, through the same RLS-as-the-user posture.

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

## Open follow-ups

- Lawyer conversation: envelope encryption, zero-data-retention terms, audit-log retention, disclaimer wording (before 07).
- Trust-doc taxonomy conversation with Dad (master-plan open decision) — feeds `category` values and the document list's grouping; doesn't block slice 1.
- PRD 08 remains gated on its own scoping conversation (what financial data belongs in-app at all).
