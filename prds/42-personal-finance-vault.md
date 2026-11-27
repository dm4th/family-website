# 42 — Personal Finance Vault ("My Finances")

**Phase**: 3 (Advisory) · **Depends on**: [40 — Trust Document Vault](40-trust-document-vault.md) (reuses its storage, audit and grant patterns wholesale)
**Status**: 📝 **draft, awaiting Dan's sign-off** (requested by Dad in an email on 2026-11-17, approved for a PRD by Dan on 2026-11-26).
**Parallel-safe with**: most PRDs. It adds new tables, a new bucket and a new `/advisory/my-finances` route, and touches nothing existing except nav. It does **not** change PRD 40's trust tables.

---

## Why this exists

Dad asked for "another tab for my own personal estate plan, income statement, expenses, and balance sheet, **locked so other users can't see it**."

That is a different thing from the two Advisory features already planned:

| | Trust vault ([40](40-trust-document-vault.md)) | Trust dashboard ([08](08-financial-dashboard.md)) | **My Finances (this PRD)** |
|---|---|---|---|
| Whose data | The family trust's | The trust's | **One person's own** |
| Default reader | Nobody, explicit grants | Beneficiaries | **Only the owner** |
| Managed by | Trust managers (Dad + Dan) | Trustees | **The owner, alone** |

So it gets its own space, and its own access model that's stricter than the trust vault's. **No role on the site, including site admin and trust manager, grants read access to someone else's personal finances.** Only the owner, plus anyone the owner explicitly shares with by name (for example Dan, or an accountant), can read them.

It's built **for every member, not just Dad**. Owner-scoped tables cost the same as Dad-only ones, and "a private place for my own estate paperwork" is useful to the whole family. The tab is visible to members and empty until someone uses it.

## User stories

- As Dad, I open **Advisory → My Finances** and drag in my estate plan PDF, last year's income statement and a balance sheet spreadsheet. They're filed under the right headings, and nobody else on the site can see they exist.
- As Dad, I keep a simple **balance sheet** (assets and liabilities, each with a value and an "as of" date) and an **income & expenses** summary. I update them a few times a year and see my net worth over time.
- As Dad, I **share** my estate plan section, read-only, with Dan, and later stop sharing. I can see who opened what and when.
- As Dan (site admin, trust manager), I **cannot** see Dad's My Finances unless he has shared it with me. That holds even on the admin page.
- As any other member, I see my own empty My Finances page and nothing of anyone else's.

## Pre-flight decision grid (needs Dan's sign-off)

| Decision | Recommendation | Notes |
|---|---|---|
| **Who can read** | **Owner only by default**, plus explicit per-person shares the owner creates. **No `is_admin()` or `is_trust_manager()` bypass anywhere.** | Stricter than PRD 40, where managers read everything. Policies key off `owner_id = auth.uid()` or a `personal_finance_shares` row. |
| **The honest limit: operators** | **State it in the UI and to Dad, plainly.** RLS stops every *site user*. It does not stop whoever *operates the database*: the Supabase project owner (Dan), anything using the database owner role (the Supabase CLI and dashboard), and a Claude session with that CLI access. | This is the same limit PRD 40 names. If Dad needs privacy even from Dan-as-operator, the answer is **app-layer encryption with a key only Dad holds** (a passphrase, encrypted in the browser). That's a real cost: no AI reading, no server-side search, and a lost passphrase means lost data. **Recommend: not in v1**, and keep the door open (UUID storage paths, no real names in object keys, same as PRD 40). Confirm with Dad that "locked from other family members" is the bar, not "locked from the site's operator". |
| **What it holds (v1)** | **Documents + two simple structured statements.** Documents in four fixed sections: **Estate plan**, **Income**, **Expenses**, **Balance sheet**, plus *Other*. Structured: a **balance sheet** (line items: name, kind asset/liability, category, value, as-of date) and an **income & expenses** summary (line items per period: name, kind, category, amount, period). | Dad works in wealth management and will have spreadsheets. v1 accepts the files as they are. The structured statements are for the at-a-glance view (net worth, income minus expenses, trend). **Not** budgeting software, bank sync or transaction import (out of scope). |
| **Sections: fixed or inferred?** | **Fixed four + Other** | These are the sections Dad named. PRD 40's inferred taxonomy fit a large unknown corpus. This is a small, known one. |
| **Sharing** | Owner shares **a whole section** (e.g. Estate plan) or **everything**, read-only, with a named member **or guest**. Revocable. | Section-level, not per-document, so there's less to manage. Guests are included so an outside accountant (a guest account via the PRD 24/39 invite flow) can be shared with. Shared readers never write. |
| **Audit** | **Append-only `personal_finance_events`**: upload, view (each signed URL), share added/revoked, delete, statement edited. **Readable by the owner only.** | Same audit-or-abort discipline as PRD 40. Every signed URL is minted by a server action that writes the event first, with a 5-minute TTL. |
| **AI access** | **None in v1.** | AI reading of these documents (e.g. Dad's assistant, "Muse") depends on the separate assistant-access conversation. When it comes, it goes through the PRD 40 rule: **the agent reads as the signed-in user, through RLS**, with no service-role key. |
| **Owner leaves / passes away** | **Rows stay owned; nothing auto-transfers.** Deactivation keeps the data but locks everyone out (active-only restrictive policies). | The estate-plan nature makes this matter. Succession (e.g. "on deactivation, share Estate plan with X") is a real need, but it's Dad's and the lawyer's call, not a v1 build. Listed in follow-ups. |

## Data model (slice 1)

- `personal_finance_documents`: id, `owner_id` (FK → profiles, ON DELETE CASCADE), `section` (enum: estate_plan, income, expenses, balance_sheet, other), name, `storage_path` (UUID path in the private **`personal`** bucket), mime_type, size_bytes, `replaces_id`, timestamps.
- `personal_finance_shares`: owner_id, `grantee_id`, `section` (nullable, where null means everything), created_at. Unique on (owner, grantee, section).
- `personal_finance_events`: append-only (insert + owner-select policies only).
- *(slice 2)* `personal_finance_items`: owner_id, `statement` (balance_sheet / income_expenses), kind, category, name, amount (numeric), `as_of` / `period_start`/`period_end`, notes, timestamps. Edits through `recordRevision()`.
- A `can_read_personal_finance(owner, section)` definer function used by table and storage policies. It's true for the owner, or for an active grantee with a matching share. PRD-26 active-only restrictive policies go on every table and the bucket.

## Build slices

1. **Slice 1: the private document vault.**
   - Migration (bucket + tables + RLS + function).
   - `/advisory/my-finances`: four section drop zones, using the PRD 40 two-drop-zone drag-and-drop component generalized. Multi-file drop with per-file results.
   - Document list per section, audited 5-minute open, replace, delete, and a share panel (add or revoke by person, per section or everything).
   - An activity list for the owner.
   - A plain-words privacy note at the top: "Only you can see this page's contents. People you share with can view, not change. The site's operator can technically access the database (here's what that means)."
   - **Negative suite before anyone uploads anything real.**
2. **Slice 2: statements.** Balance-sheet and income & expenses editors (simple rows, add/edit/delete, revisions logged). Summary cards for net worth, total assets and liabilities, and income minus expenses for the period. A net-worth-over-time chart from `as_of` snapshots (Recharts or shadcn charts; PRD 08 planned the same dependency, so pick once). An optional "import from spreadsheet" action that reads a CSV/XLSX the owner already uploaded and **proposes** rows for approval (the AI-proposes, human-confirms pattern) is a stretch goal, only if Dad's files make it worthwhile.

## Verification recipe

**Negative suite (prod, real JWTs, rolled-back transaction):**
- Owner: reads, writes and audits their own data.
- **Site admin who isn't the owner: zero rows from every table, storage function denies, can't self-share.**
- **Trust manager: same zero.**
- Ungranted member: zero.
- Granted member: sees only the shared section, can't write, can't read the audit log, can't add shares.
- Granted guest: same as a granted member.
- Revoked share: cut off immediately.
- Deactivated owner: nobody reads, the owner included.
- Direct storage-path probing: denied.
- Audit log: update/delete touch 0 rows.

Then a real walk with Dad's first non-sensitive document. `tsc`, `eslint` and `next build` must all pass.

## Likely file layout

```
supabase/migrations/<ts>_personal_finance_vault.sql
src/lib/personal-finance/{shared,auth,audit}.ts
src/app/(app)/advisory/my-finances/{page.tsx,actions.ts,section-upload.tsx,share-panel.tsx}
src/components/app-shell/nav-config.ts   # "My Finances" under Advisory
```

## Out of scope

Bank or brokerage sync (Plaid/Yodlee), transaction-level budgeting, tax preparation, investment performance analytics, editing documents in the browser, AI reading (pending the assistant decision), and app-layer encryption (door kept open).

## Open follow-ups

- **Confirm the privacy bar with Dad**: hidden from family members (v1), or also from the site operator (app-layer encryption, with its costs)?
- **Succession**: what should happen to an owner's estate-plan section when they pass away or are deactivated? Dad and the lawyer decide, then a small follow-up slice.
- **Overlap with PRD 08**: if Dad's balance sheet includes his trust interest, the two may later want a link. Not before both exist.
