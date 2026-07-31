# 33 — Intake Document Retention & Management

**Phase**: 7 (authoring assist) · **Depends on**: 32 (Smart Intake — the `intake` bucket, `intake_documents`, and the intake review flow are what this manages)
**Status**: 🚧 in progress (2026-07-31) — built on branch `prd-33-intake-retention`; migration pending application to prod, live walk pending.
**Parallel-safe with**: most feature PRDs (one new panel + one server action; touches nothing outside the intake surface).

---

## Why this exists (the gap, made concrete three times)

Every document Smart Intake reads is stored forever in the private `intake` bucket, with a provenance row in `intake_documents` — and **there is no way to see or remove either from the app**. That gap bit during all three PRD-32 verification walks:

- Each walk left orphaned rows and/or objects behind; by the end there were **6 rows and 4 objects of pure test debris** in production.
- The slice 2 builder tried to clean up after themselves and was **blocked by a permission guard** with no app-side alternative.
- The final cleanup (2026-07-31) required **direct database surgery plus a hand-built Storage API call** — Supabase's `storage.protect_delete()` trigger rightly refuses SQL deletes on `storage.objects`, so there is genuinely no path but the Storage API, which only the app can invoke ergonomically.

The stakes rise the moment Dad starts real use: these documents are **utility bills, insurance statements, and tax notices** — account numbers, policy numbers, amounts. Private-bucket + guests-excluded is the right access posture (shipped in PRD 32), but *indefinite, invisible accumulation of financial documents with no owner controls* is not the right retention posture for a family site.

## Goal

A member can **see** every document that has been read for a property, **re-open** the original, and **delete** it — object and provenance row together, through the app, with a confirm. Site admins can tidy anyone's. Nothing else changes: intake keeps storing sources at extraction time exactly as today.

## What already exists (don't rebuild)

| Piece | State |
|---|---|
| `intake_documents` rows | Already hold everything the list needs: `property_id`, `storage_path`, `content_type`, `byte_size`, `intent`, `uploaded_by`, `created_at` |
| Row delete policy | `owner or is_admin()` — already shipped in `20260730000001_smart_intake.sql` |
| Object delete policy | **Owner-only** (`intake bucket: owner delete`) — the one gap; see migration below |
| Signed-URL open | `createSignedUrl` pattern already used by the slice 2 review screen (30-min TTL) |
| Confirm idiom | `ConfirmButton` (PRD 30) — destructive actions use it everywhere |

## Pre-flight decisions

| Decision | Recommendation | Why |
|---|---|---|
| **Where the list lives** | A "Documents We've Read" section on the intake page (`/properties/[slug]/edit/intake`), below the upload cards. | It's where the documents come from, and keeps the edit page uncluttered. Members who never use intake never see it. |
| **Who can delete** | Uploader or site admin (matching the row policy). Requires extending the **storage** delete policy to `or is_admin()` — one small migration. | A family member shouldn't need the original uploader to come back from vacation to tidy a bucket of financial documents. |
| **Delete ordering** | One server action: Storage API remove first, then the row; **tolerate an already-missing object** (that's the orphan case the walks produced). | Object-first means a failed delete leaves a visible row (retryable), never an invisible orphaned object. |
| **Auto-retention (TTL sweep)** | **Defer.** Ship manual management first; revisit a "tidy documents older than N months" sweep only if the list visibly piles up. | Dad's volume is a stack of paper, not a firehose. Manual-with-visibility beats a policy nobody chose; deleting family data on a timer needs an explicit ask. |
| **Guest posture** | Unchanged: guests never see the intake page, the rows, or the bucket (PRD 32 RLS). This PRD adds no guest-reachable surface. | Already verified by the slice 3 negative suite. |

## In scope

- **Migration** (`..._intake_admin_delete.sql`): recreate the `intake` bucket delete policy as `owner or is_admin()`, mirroring the `intake_documents` row policy. *(The only DB change.)*
- **Server action** `deleteIntakeDocument(documentId)`: resolve viewer → reject guest → load the row → authorize (uploader or admin) → Storage remove (tolerant of 404/already-gone) → delete row. No `recordRevision` — provenance rows aren't member content and their deletion shouldn't spam the audit trail; the action logs to the server console instead.
- **"Documents We've Read" panel** on the intake page: date, kind (bill / note), size, uploader name; **Open** (fresh 30-min signed URL) and **Delete** (`ConfirmButton`, copy warning that the original photo is removed for everyone). Empty state: one quiet line, not an empty table.
- Orphan tolerance both ways: a row whose object is gone still lists (marked "photo no longer stored") and deletes cleanly; the action never errors on a missing object.

## Out of scope

- Automatic TTL/scheduled deletion (deferred — see pre-flight).
- Any change to what intake stores at extraction time.
- Cross-property or admin-global document browser (per-property is enough at family scale).
- Retention for other buckets (photos have their own lifecycle).

## Verification recipe

1. **List** — read two documents on a test property → both appear with correct kind/date/size/uploader; Open shows the original; signed URL unsigned returns 400.
2. **Owner delete** — uploader deletes one via the confirm → row gone from the list, object gone from the bucket (verify both at the DB), no revision row written.
3. **Admin delete of another member's document** — works after the migration; a non-admin member deleting someone else's is refused (action + RLS + storage policy).
4. **Orphan tolerance** — a row pointing at a deleted object lists as "photo no longer stored" and deletes without error.
5. **Guest** — intake page still 404s; direct `deleteIntakeDocument` call rejected.
6. **Abandon-an-upload check** — extract without saving, then delete the document from the new panel: full cleanup now possible entirely in-app (the thing the walks couldn't do).

## Likely file layout

```
supabase/migrations/20260731xxxxxx_intake_admin_delete.sql   # storage delete policy → owner or is_admin()
src/app/(app)/properties/[slug]/edit/intake/actions.ts       # + deleteIntakeDocument
src/app/(app)/properties/[slug]/edit/intake/documents-panel.tsx  # the list (server-loaded, client delete)
src/app/(app)/properties/[slug]/edit/intake/page.tsx         # render the panel below the upload cards
```

## Reviewer sign-off (I check these)

- [ ] Delete authz enforced in the action **and** at RLS/storage policy (uploader or admin), guests rejected.
- [ ] Object-first delete, tolerant of already-missing objects; row never orphans an object.
- [ ] Signed-URL-only access; nothing in the panel leaks a public path.
- [ ] No guest-reachable surface added; slice 3's negative-suite posture unchanged.
- [ ] Copy follows house style (Title Case buttons, no em-dashes, sentence-case body; confirm dialog states the photo is removed for everyone).
- [ ] Migration applied to prod + a live admin-delete and owner-delete each walked once.

## Implementation

**Key files**

| File | What it does |
|---|---|
| `supabase/migrations/20260731000001_intake_admin_delete.sql` | Drops `intake bucket: owner delete`, recreates as `intake bucket: owner or admin delete` (`owner or is_admin()`). The only DB change. |
| `src/lib/intake/documents.ts` | `loadIntakeDocuments(propertyId)` — server-side read: rows + uploader name + per-row object-existence. Mints no signed URLs. |
| `src/lib/intake/document-view.ts` | Browser-safe half: the `IntakeDocumentRow` type, `intakeKindLabel`, `formatByteSize`. |
| `src/app/(app)/properties/[slug]/edit/intake/actions.ts` | `+ intakeDocumentUrl(documentId)` and `+ deleteIntakeDocument(documentId)`, sharing one `loadDocumentFor()` authorization gate. |
| `src/app/(app)/properties/[slug]/edit/intake/documents-panel.tsx` | The list: kind, date, uploader, size; Open + Remove. |
| `src/app/(app)/properties/[slug]/edit/intake/page.tsx` | Loads the rows and renders the panel below the upload cards. |

**Decisions made during the build**

- **Signed URLs are minted on click, not at page load.** The PRD's "Open (fresh 30-min signed URL)" could have been satisfied by signing every path while drawing the list, which is one fewer round-trip. It was rejected: that hands out a live 30-minute link to every stored bill on the property just for *looking at* the panel, including to a member who opens the page and leaves. `intakeDocumentUrl` signs one document, on request. Drawing the panel discloses nothing.
- **"Photo no longer stored" is established by listing, never by probing.** Existence is resolved by listing each distinct two-character folder once (intake paths are `xx/uuid.ext`), so the check costs at most 256 calls and in practice one or two. The obvious alternative — try to sign each path and treat failure as absence — would mint a URL for every present document purely to answer a question about it, which is the same disclosure the point above avoids.
- **A listing failure reports the paths as present.** A wrongly-drawn "photo no longer stored" invites a member to write off a document that is actually still in the bucket. Silence is the safer error.
- **Object-first, but "missing" is proven before the delete, not inferred after it.** Supabase's `remove()` returns an empty array both when the object was already gone *and* when policy refused the delete. Treating that response as "already gone" would drop the provenance row on a permission failure and manufacture exactly the invisible orphan this PRD exists to eliminate. So the folder is listed first: object present and `remove()` returns nothing → throw, row untouched, document still visible and retryable.
- **No `recordRevision`,** per the PRD. These rows are provenance *about* member content, not the content, and deleting one shouldn't push a family member's edits down the history page. `console.info` carries the trace, including whether the object was already gone.
- **The panel renders even when `ANTHROPIC_API_KEY` is unset.** Documents already stored still need an owner control; pulling the key shouldn't lock anyone out of tidying what it produced.
- **Remove is hidden for members who can't use it** (not shown-and-refused), matching the row and storage policies. The action still refuses independently — the hidden button is UX, `loadDocumentFor` is the boundary.

**Caught during the build**

- The first cut put the type and the two display formatters in `documents.ts` alongside the loader, and the client panel imported them. The production build refused it: `documents.ts` reaches the server Supabase client and so `next/headers`, which would have been pulled into the browser bundle. Split into `document-view.ts` (browser-safe) and `documents.ts` (server). `tsc --noEmit` passed on the broken version — only `npm run build` caught it.

**Verification**

- `npx tsc --noEmit` clean, `npx eslint` clean on touched paths, `npm run build` green.
- _(Live walk pending: migration application to prod, then the six-step recipe above.)_

**Follow-ups**

- Auto-TTL sweep still deferred, as decided in pre-flight.
- The panel is per-property. An admin wanting to audit every document across all properties still has no single view; per-property is enough at family scale, but this is where that would go.
