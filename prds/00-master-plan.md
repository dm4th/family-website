# Family Trust Portal — Master Plan

> **Source of truth**: the original lives at `~/.claude/plans/this-is-the-first-clever-avalanche.md`. This copy is kept in the repo so subagents working off `prds/` see it. Edit the source; refresh this copy when it changes.

🎉 **First slice live at https://mathiesonfamily.app** as of 2026-05-24. All 8 foundation chunks shipped. Future work is now organized as discrete feature slices that can be picked up in small, parallel sessions.

---

## Starting a new session (read this first)

If you're a contributor (human or agent) picking up work on a specific feature:

1. **Read [CLAUDE.md](../CLAUDE.md)** — project conventions (stack, Supabase keys, Next.js 16 proxy rename, admin tiers, "update PRDs when finishing a chunk").
2. **Skim this file's "Active queue"** below to find the right PRD.
3. **Read the per-feature PRD top-to-bottom.** Each unshipped PRD has a `Status`, `Onboarding`, `Pre-flight decisions`, `Likely file layout`, and `Verification recipe` section that should give you everything you need to start.
4. **Check [supabase/README.md](../supabase/README.md)** if your work involves migrations.
5. **Consult the skills at `.agents/skills/`** for Supabase patterns (the `supabase` and `supabase-postgres-best-practices` skills are more current than training data).
6. **Branch + ship + update the PRD's Implementation section** when you're done. Flip the status in the table below.

The first-slice build was a single long session, deliberately. From here, every feature should be its own session/branch — easier to review, parallelize, and recover from.

## Active queue (what's pickable right now)

| PRD | Status | Parallel-safe with | Notes |
|---|---|---|---|
| [05 — File uploads + Google Photos](05-file-uploads.md) | ✅ shipped (2026-06-23) | — | Direct-to-Supabase upload + Google Photos Picker (per-pick consent import) + per-photo Remove UI, shipped via PR #1. Delete authz (uploader / site admin / property admin) enforced in RLS + `deletePhoto`. Migrations applied to prod. |
| [06 — Property booking](06-property-booking.md) | ✅ shipped (2026-06-23) | — | Per-property + unified calendars, peak-period gating, admin approve/decline, ICS feeds, revisions audit. Shipped via PR #2. RLS self-approve closed (trigger), exclusive `end_date`, `btree_gist` double-booking guard. Migrations applied to prod (verified: trigger + exclusion constraint + strict CHECK live). |
| [12 — Authoring UX](12-authoring-ux.md) | ✅ shipped | — | **Foundational — build before 11.** A shared content-editing layer (friendly rich-text editor, chip lists, date/people pickers, inline edit) so non-technical family members can CRUD content without seeing Markdown or developer conventions. Retrofits properties + profiles; Legacy consumes it natively. |
| [14 — Booking Notifications](14-booking-notifications.md) | ✅ shipped (PR #6) | — | Transactional **email** (Resend) on all four booking events — auto-approve → booker confirmation **+ calm FYI to property admins + Dan**; pending → urgent admin alert; approve/decline/admin-cancel → booker. Best-effort + gated on `RESEND_API_KEY` (no key → log-and-skip; booking still succeeds). First real email provider wired. Recipients read via session (not a `SECURITY DEFINER` fn — accepted in review). Reminders + Resend prod-provisioning deferred. |
| [11 — Family Legacy](11-family-legacy.md) | 🟢 ready (after 12) | — | **Lives inside the Family zone (not a new top-level zone)** — historical photo archive, family tree, timeline, stories. Build as four sequenced slices: **Photo Archive → Family Tree → Timeline → Stories**. Slice 1 introduces the keystone `people` table (ancestors who'll never log in). Consumes the [12](12-authoring-ux.md) authoring layer. Absorbs PRD 10. |
| [13 — Onboarding & Profile](13-onboarding-welcome-help.md) | ✅ shipped (2026-06-29) | 16 | All four slices via PR #7: guided `/welcome` first-run flow (gated on `profiles.onboarded_at`, kills the "Unnamed" landing), Family Branch dropdown, inline profile photo, welcome panel & `/help`. New `onboarded_at` column + backfill — migration applied to prod. Note: a cross-PR redirect loop with 15 (un-onboarded guests → `/welcome`) was hotfixed in `a01354b` (guests exempt from the onboarding gate). |
| [16 — UI Polish & Copy](16-ui-polish-copy.md) | ✅ shipped | 13, 14, 17 | Title Case site-wide (eyebrows left as-is), em-dash scrub (placeholders kept), calendar legend verified + `Property · Person (N guests)` band labels, unified ICS title `[Property] \| [Person]`, standalone Home nav link + clickable wordmark. No DB/route/dep changes; tsc + eslint + build green. |
| [17 — Image Performance](17-image-performance.md) | ✅ shipped | 14, 16 | Client-side downscale on upload (2048px/JPEG q0.82) + thumb-on-upload (400px companion) + per-context rendition helper with graceful full-object fallback. Live-verified: 6.25MB→129KB display + 12KB thumb, grid tiles fetch the 400px thumb. Also fixed thumb cleanup on photo delete. tsc + eslint + build green. |
| [15 — Guest Access](15-guest-access.md) | ✅ shipped (2026-06-29) | — | Property-scoped guest role: first real member/guest RLS differentiation + `property_guests` join + middleware/page gating. Shipped via PR #8; migration applied to prod; **live-verified end-to-end** (member access intact + full negative suite passed from a real guest session). Verification caught a cross-PR redirect loop (13×15), hotfixed in `a01354b`. Follow-up: storage signed-URL hardening (defense-in-depth). |
| [09 — Family messaging](09-family-messaging.md) | 🟡 hold | — | Don't build until the family is actively using the portal — otherwise it's an empty room. Re-evaluate in 2-3 months of usage. |
| [10 — Family timeline](10-family-timeline.md) | 🔵 absorbed | — | Now a slice inside [11 — Family Legacy](11-family-legacy.md). PRD 10 retained for its detailed timeline schema/UX notes. |
| [07 — Trust-doc RAG](07-trust-doc-rag.md) | 🔴 blocked | — | Gated on the trust-doc security decision (see Open decisions). Don't start until that conversation has happened. |
| [08 — Financial dashboard](08-financial-dashboard.md) | 🔴 blocked | — | Same security gate as 07, plus a real scoping conversation with Dan's dad about what data should surface. |

**Parallel-safety legend**: features marked "parallel-safe with" can be developed simultaneously without merge conflicts (different tables, different routes, different components). The shared infrastructure (PhotoUpload, recordRevision, canManageProperty, etc.) is stable — adding to it is fine; reshaping it should be done in a dedicated session.

## Round-2 follow-up queue (from the 2026-06-30 testing round)

Small, scoped fixes from [docs/testing-playbook-round-2.md](../docs/testing-playbook-round-2.md). Each is **its own branch/PR** so it can be reviewed in isolation; full spec (problem, scope, files, acceptance criteria) lives in the linked PRD's "Round 2" section. No migrations required by any of these. Parallel-safe with each other (different surfaces).

| Slice | PRD | What | Status |
|---|---|---|---|
| **13-R2** | [13](13-onboarding-welcome-help.md#round-2--testing-feedback-2026-06-30) | Collect **Generation** (+ phone, relationship notes) in the `/welcome` flow so new members stop landing as "Generation Not Set"; de-dupe the generation labels into a shared helper. | ✅ shipped |
| **06-R2** | [06](06-property-booking.md#round-2--testing-feedback-2026-06-30) | **Two-tap** date selection (1st tap = Arrive, 2nd = Last Night) instead of drag/single-tap booking a 1-night stay; move the `/calendar` legend **beneath** the grid. | ✅ shipped |
| **14-R2** | [14](14-booking-notifications.md#round-2--testing-feedback-2026-06-30) | Booker **"request received, pending approval"** email on the pending path (today only admins are notified). | ✅ shipped |
| **14-R2-OPS** | [14](14-booking-notifications.md#round-2--testing-feedback-2026-06-30) | **Supabase Auth custom SMTP** (Resend) + raise auth email rate limits — clears the `email rate limit exceeded` wall that blocked guest testing. **Owner action (Dan), not a code PR.** | ✅ done (2026-06-30, verified) |
| **17-R2** | [17](17-image-performance.md#round-2--testing-feedback-2026-06-30) | Full-res question **answered in-PRD** (decided: not building — 2048px display is by-design; archival-originals path sketched if ever wanted). | ✅ doc-only |
| **15-R2** | [15](15-guest-access.md#round-2--testing-feedback-2026-06-30) | **Guest-appropriate profile editor** — guests currently see the full member editor ("What the Family Sees", branch/generation/relationship). Show a guest variant: name + photo + phone only, Operations framing. | 🟢 ready |

**Verified healthy in round 2 (no action):** booking emails (all four delivered in prod, incl. both admin notifications — Resend send log confirmed; the "admin emails didn't arrive" report was a solo-tester visibility artifact, they went to Peter's inbox), image performance (9.2MB case resolved), UI polish sweep, light/dark, empty states, iPad onboarding.

## Open decisions blocking future work

These need a real conversation (not just a one-person call) before the gated PRDs can start:

- **Trust-doc security model** — gates 07 + 08. Decide: encryption-at-rest beyond Supabase default? Audit logging requirements? Zero-retention LLM agreement? Self-hosted vector DB vs. pgvector in Supabase? See [07-trust-doc-rag.md](07-trust-doc-rag.md) §Open questions for the full list.
- **Property access scoping** — should some properties be hidden from some family branches, or is it open-by-default forever? Currently open. _Partially addressed_: [15 — Guest Access](15-guest-access.md) delivers per-property scoping **for guests** (via a `property_guests` grant). Member-to-family-branch scoping remains open and out of scope for 15.
- **Trust-doc taxonomy** — needs a conversation with Dan's dad about how the trust docs are actually organized today. Required before 07.
- **Financial data surface** — what numbers belong in-app vs. in your existing family-office tools? Required before 08.

## Foundation that's already built (use these — don't reinvent)

Anything new you build should reuse what's here. The patterns are battle-tested by the first slice.

**Auth + session**
- `src/lib/supabase/{server,client,middleware}.ts` — `@supabase/ssr` wrappers
- `src/lib/supabase/env.ts` — prefers `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, falls back to anon
- `src/proxy.ts` — auth gate on every route except `/login`, `/auth/*`, Next internals
- `src/app/sign-out/actions.ts` — `signOut()` Server Action

**Database + migrations**
- `supabase/migrations/` — SQL is the source of truth; apply with `supabase db push`
- `src/lib/db/schema.ts` — Drizzle mirror for app-side TypeScript types
- `is_admin()` Postgres function + `requireAdmin()` helper in `src/app/(app)/admin/actions.ts`
- `is_property_admin(uuid)` Postgres function + `canManageProperty(id)` in `src/lib/property-auth.ts`

**Photos + storage**
- `src/lib/photo-utils.ts` — browser-safe helpers (path gen, MIME check, MAX_PHOTO_BYTES = 50MB)
- `src/lib/photos.ts` — server-only `withSignedUrls()` for batch signing
- `src/lib/avatars.ts` — `resolveAvatarUrls()` handles both http(s) and storage-path avatars
- `src/components/photo-upload.tsx` — drag-drop + mobile camera; uploads direct to Supabase Storage (not through Vercel Functions, so no 4.5MB limit); attaches to `{ kind: "profile" | "property"; id }`
- `src/app/(app)/photos/actions.ts` — `recordUploadedPhoto`, `deletePhoto`

**Wiki editing pattern**
- `src/lib/revisions.ts` — `recordRevision({ entityType, entityId, changedBy, before, after })`; computes shallow diff, inserts to `revisions` table; best-effort (audit failures don't roll back the main write)
- Reference implementation: `src/app/(app)/properties/[slug]/actions.ts` (`updateProperty`)

**UI components**
- `src/components/ui/*` — shadcn/ui (we own the source, not a dependency)
- `src/components/markdown.tsx` — react-markdown + remark-gfm, no raw HTML passthrough, styled via `@tailwindcss/typography` `prose` classes
- `src/components/profile-avatar.tsx` — avatar with initials fallback (sm/md/lg/xl)
- `src/components/user-menu.tsx` — header dropdown; takes `isAdmin` to conditionally render Admin link

**Conventions to follow**
- Use Server Components for reads; Server Actions for writes
- `dynamic = "force-dynamic"` on auth-gated pages
- `revalidatePath()` after writes
- Use plain `<img>` for signed Supabase URLs (not `next/image` — signed URLs rotate per request and would churn the CDN cache)

## Chunk status (history)

| # | Chunk | Status | PRD |
|---|---|---|---|
| 1 | Project scaffolding | ✅ shipped | — |
| 2 | Auth + session shell | ✅ shipped | [01-auth](01-auth.md) |
| 3 | DB schema + RLS + seed | ✅ shipped | — (see [supabase/README.md](../supabase/README.md)) |
| 4 | Family directory + profiles + photo uploads | ✅ shipped | [02-family-directory](02-family-directory.md) |
| 5 | Property pages + wiki editing | ✅ shipped | [03-properties](03-properties.md) |
| 6 | Admin panel + invitations | ✅ shipped | [04-admin-invitations](04-admin-invitations.md) |
| 7 | Coming-soon stubs + dashboard polish | ✅ shipped | — |
| 8 | Deploy + smoke test | ✅ shipped (2026-05-24) | See README §Deploy |

Plus during chunk 5: **property admins** join table + helper (per-property elevated role, separate from site admin) — see [03-properties.md](03-properties.md) Implementation.

Plus during chunk 8: photo-upload-payload-size fix — see [05-file-uploads.md](05-file-uploads.md) Implementation.

## Tech stack (reference)

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui (radix-nova preset, neutral base) + `@tailwindcss/typography` |
| Database + Auth + Storage | Supabase (managed Postgres + Auth + Storage, pgvector available for future RAG) |
| ORM | Drizzle (types only — SQL migrations are the source of truth) |
| Image handling | Plain `<img>` with batch-signed URLs from Supabase Storage |
| Email | Supabase Auth handles magic links built-in; **Resend** wired for transactional booking notifications ([14](14-booking-notifications.md)) — best-effort, gated on `RESEND_API_KEY` (no key → log-and-skip) |
| Hosting | Vercel (free tier) |
| AI / RAG (Phase 3) | Vercel AI SDK + Anthropic Claude + pgvector in Supabase |

Rejected alternatives: Convex, Cloudflare full-stack, T3 stack, Remix. See `~/.claude/plans/this-is-the-first-clever-avalanche.md` for rationale.

## Context (why this exists)

Private family website Dan's dad asked him to build over a year ago. Audience is a multi-generational family (~23 people today, growing):

- **Gen 1 (5)**: 3 siblings in their 60s + 2 spouses (the older sister has passed; one sibling is single)
- **Gen 2 (15)**: 9 grandchildren + 6 spouses of those grandchildren — **spouses are first-class family members**, not a separate role
- **Gen 3 (3)**: great-grandchildren, with more coming

Core needs: (a) coordinating shared family properties (Loon-A-See + Loon-E-Bin on Squam Lake NH, Moosedraw in Big Sky MT — Dan's dad is in family-wealth management, so trust integration follows), (b) eventually surfacing trust/wealth-management documents through agentic search, (c) a private place for the family to share information. Members edit content collaboratively (wiki-style) so this doesn't become one person's full-time maintenance job.

Two prior PRDs in PDF (`MVP-PRD.pdf`, `FUTURE-PRD.pdf`) are roughly a year old and informed the early thinking; the markdown files (`01-…` through `10-…`) are the current source of truth.
