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
| [11 — Family Legacy](11-family-legacy.md) | 🚧 in progress — **all 4 slices built 2026-06-30**: 1 (Archive), 2 (Tree) & 3 (Timeline) ✅ shipped to prod; **4 (Stories) built + PR'd, prod-apply pending** · **reqs locked 2026-06-30** | — | **Lives inside the Family zone (not a new top-level zone)** — historical photo archive, family tree, timeline, stories. Four sequenced slices: **Photo Archive → Family Tree → Timeline → Stories**. **Slice 1**: `albums`/`album_photos`/`photo_people` + fuzzy-dating, `/family/archive`. **Slice 2**: `relationships` graph, person + edge authoring (adds ancestors with **no account**), traversable `/family/tree` + person pages. **Slice 3**: `events`/`event_people`/`event_photos`, `/family/timeline` (events + dated archive photos, **decade jump rail + person/branch filter**), event pages. **Slice 4**: `stories`/`story_people` (subjects → people, optional album/event links), `/family/stories` hub + detail, surfaced on person/album/event pages. _(Slices 1–3 migrations applied to prod + verified; **slice 4 migration built + PR'd, not yet applied**.)_ Consumes the [12](12-authoring-ux.md) authoring layer. Absorbs PRD 10. |
| [13 — Onboarding & Profile](13-onboarding-welcome-help.md) | ✅ shipped (2026-06-29) | 16 | All four slices via PR #7: guided `/welcome` first-run flow (gated on `profiles.onboarded_at`, kills the "Unnamed" landing), Family Branch dropdown, inline profile photo, welcome panel & `/help`. New `onboarded_at` column + backfill — migration applied to prod. Note: a cross-PR redirect loop with 15 (un-onboarded guests → `/welcome`) was hotfixed in `a01354b` (guests exempt from the onboarding gate). |
| [16 — UI Polish & Copy](16-ui-polish-copy.md) | ✅ shipped | 13, 14, 17 | Title Case site-wide (eyebrows left as-is), em-dash scrub (placeholders kept), calendar legend verified + `Property · Person (N guests)` band labels, unified ICS title `[Property] \| [Person]`, standalone Home nav link + clickable wordmark. No DB/route/dep changes; tsc + eslint + build green. |
| [17 — Image Performance](17-image-performance.md) | ✅ shipped | 14, 16 | Client-side downscale on upload (2048px/JPEG q0.82) + thumb-on-upload (400px companion) + per-context rendition helper with graceful full-object fallback. Live-verified: 6.25MB→129KB display + 12KB thumb, grid tiles fetch the 400px thumb. Also fixed thumb cleanup on photo delete. tsc + eslint + build green. |
| [15 — Guest Access](15-guest-access.md) | ✅ shipped (2026-06-29) | — | Property-scoped guest role: first real member/guest RLS differentiation + `property_guests` join + middleware/page gating. Shipped via PR #8; migration applied to prod; **live-verified end-to-end** (member access intact + full negative suite passed from a real guest session). Verification caught a cross-PR redirect loop (13×15), hotfixed in `a01354b`. Follow-up: storage signed-URL hardening (defense-in-depth). |
| [24 — Member Invites & Invite-Only Access](24-member-invites-access.md) | 🟢 ready (2026-07-01) · **SECURITY — do first** | — | **The site is currently open**: any sign-in (magic link or Google) defaults to `member`, so anyone with the URL gets in. Fix: email-bound invite-only. One-line `handle_new_user` change (raise instead of default-member) closes both paths; ungate the existing invite flow so **any member** can invite a member or a guest-for-a-property (admin invites stay admin-only); graceful "you need an invitation" page. **Nothing shared with family until this ships + is live-tested.** |
| [18 — Legacy Bulk Authoring](18-legacy-bulk-authoring.md) | ✅ shipped (slices 1-2, 2026-07-01) | 19, 20 | **The content unlock.** CSV bulk people import (`/family/tree/import`, ancestors with no accounts, preview-before-commit, DB-authoritative dedup + revisions) + zip-archive photo upload into an album (client JSZip unzip → existing PRD-17 downscale/thumb + direct-to-Storage pipeline, EXIF dating, era-for-all, batch tagging). Hand-rolled pure CSV parser (no dep); `jszip`/`exifr` dynamically imported client-only. **No migration** (existing tables/columns). Slice 3 (Google Photos multi-import) deferred. Attribution guardrail looped at scale; guests blocked by RLS + route 404. |
| [19 — Shell Nav & Home](19-shell-nav-home.md) | ✅ shipped (2026-07-01) | 18, 20 | Group the crowded top nav into **mode dropdowns** (Family/Operations/Advisory, accent-tinted, via shadcn `NavigationMenu`) and restructure the homepage into **three calm doors** instead of a link wall. Shared `nav-config.ts` drives nav + homepage so they can't drift; **Admin + Feedback live in the user menu** (they're account utilities, not Advisory, which is the financial-stewardship zone: trust documents + finances, none built yet); coming-soon pages render as muted "Soon" rows both on the homepage doors **and at the bottom of the top-nav dropdowns** — so the Advisory dropdown previews Documents & AI + Finances, and Family lists Messaging, all muted. Guest-nav gating preserved. Design-only; no new tables/routes/deps. `tsc`+`eslint`+`build` green; interactive verification (keyboard/guest/iPad) pending. |
| [20 — Feedback & Suggestions](20-feedback-suggestions.md) | ✅ shipped (2026-07-01) | 18, 19 | `feedback` table + RLS (guests **can** submit — insert not `is_guest()`-gated) + one-click "Send Feedback" sheet in the footer (every page, incl. guest shell) + `/admin/feedback` triage (New→Seen→Planned→Done, folded into the Advisory nav group) + best-effort Resend alert. tsc/eslint/build green. **Migration applied to prod 2026-07-01.** |
| [32 — Smart Intake](32-smart-intake.md) | ✅ **shipped — all 3 slices** (2026-07-31) | most | **The typing-relief unlock for Dad.** Photograph a bill/note → server-side Claude vision (`claude-haiku-4-5`, ~$0.004/doc) extracts fields → the **existing** edit form opens **pre-filled** → member reviews + Saves. **AI never writes; only pre-fills a form a human confirms** (stays inside the PRD-27 gated write path + `recordRevision`; privileged cols unreachable via a schema whitelist; guests blocked at route + action + RLS). **Slice 1 (property details from a bill: vendor `property_contacts` + service address) live + reviewer-verified end-to-end on prod** (both save paths walked, privileged fields preserved, test data cleaned up). Migration applied; `ANTHROPIC_API_KEY` set in Vercel. **Slice 2 (handwritten notes → guidelines / how-to / contacts, member-routed) live + reviewer-verified end-to-end on prod**: transcription-first review screen, signed link back to the photo, note-intent eval (30 extractions) that caught a 400 that would have broken every upload and a contact-fabrication case (**zero fabrications in 126 scored fields** after fixes); review caught + fixed pre-merge a second-save-reverts-first bug between the two `updateProperty` forms (`refreshIntakeProperty` refetch); live walk confirmed the fix (Guidelines then How-To saved sequentially, both survived) plus a digit-exact contact save, all test data cleaned up. **Slice 3 shipped (PR #34, 2026-07-31)** — scope corrected at build time: no calendar create action existed (`bookings` is stays-only; `events` is the Legacy timeline), so it built a **`property_reminders`** model first (table + RLS + gated actions with `recordRevision` + recurrence stored as a rule and expanded on demand, month-end clamped; rendered on the property calendar, the unified calendar, and the ICS feed, **guests excluded at RLS *and* in a dedicated SECURITY DEFINER feed function** per PRD-25) with the `calendar` intake intent on top. Migration applied to prod; walked live end to end (feed clamping incl. leap February, both calendars, a real bill read, cleanup verified); **guest exclusion verified by a reviewer-run 10-check negative suite against prod** (real guest with a property grant sees 0 rows at every layer; deactivated token raises 28000; all rolled back). 26 recurrence checks (caught a real occurrence-vs-months indexing bug that silently emptied quarterly/annual repeats) + a 36-extraction eval (~$0.0033/doc): perfect restraint on a paid-receipt document, one wrong-**year** fabrication now flagged in the UI as a past date; walk also caught + fixed a confirmation that reported the model's guess instead of what was saved. Follow-up: intake-doc retention/management spun out as [PRD 33](33-intake-retention.md); all test debris (6 rows + 4 objects) cleaned from prod 2026-07-31, bucket + table at zero. |
| [33 — Intake Retention & Management](33-intake-retention.md) | ✅ **shipped** (PR #35 merged 2026-07-31; migration applied; reviewer live-walked owner-delete, admin-delete of another member's doc, orphan-row delete, and signed-URL open on prod — bucket + table verified back at zero, no revision rows written) | most | **Small, single-session.** A "Documents We've Read" panel on the intake page: list every bill/note read for a property (date, kind, size, uploader), re-open via signed URL, and **delete through the app** (object + provenance row together, `ConfirmButton`, orphan-tolerant). One small migration: extend the `intake` bucket delete policy to `owner or is_admin()` (rows already have it). Exists because all three PRD-32 walks left debris that took direct DB surgery + a hand-built Storage API call to remove (`storage.protect_delete()` blocks SQL) — and because Dad's real bills carry account/policy numbers that shouldn't accumulate invisibly forever. Auto-TTL sweep deliberately deferred; manual-with-visibility first. |
| [34 — Intake Entry & Dictation](34-intake-entry-and-dictation.md) | ✅ **shipped** (PR #36 merged 2026-07-31; reviewer live-walked the full voice path on prod same day: messy transcript tidied with self-correction resolved, "the fifteenth" → 2026-08-15 with the spokenAs quote shown, contact + monthly reminder + page appends saved through the gated actions with revisions, both Spoken notes opened to their raw transcripts and deleted through the PRD 33 panel, bucket + table verified back at zero) | most | **Two slices, both small.** Slice 1: a proper front door for Smart Intake on the property edit page (a band under the PageIntro with "Add from a Photo" + "Add by Voice" buttons, replacing the buried Contacts-header link). Slice 2: dictation — speech captured via the keyboard mic (Web Speech as enhancement only), cleaned into markdown by a new text-input `dictation` intent shaped like the note intent, then walked through the **existing** note-review routing (House Rules / How Things Work / contacts / reminders) with a progress line. Raw transcript stored as a `.txt` in the `intake` bucket so PRD 33 retention covers voice for free. Same non-negotiable: AI proposes, member reviews, gated actions save. Eval required (each PRD-32 eval caught a shipping bug). No migration expected. |
| [35 — Hero Photo Picker](35-hero-photo-picker.md) | ✅ **shipped** (PR #42 merged `22d7606` 2026-07-31; reviewer live-walked on prod 2026-08-01: set the oldest photo as hero with detail + listing agreeing, a fresh upload didn't displace it, deleting the hero provably nulled the pointer at the DB, explicit clear returned newest-photo behavior — 4 revisions with correct diffs, prod restored to pre-walk state so Dad makes the first real choice) | 36, 37, most | **Small, single-session.** `properties.hero_image_path` exists and the listing cards honor it, but the detail page ignores it (newest upload always wins) and no UI writes it. Add "Make This the Hero" per gallery photo (via `canManageProperty()`, PRD-27 DB guard already covers the column — no migration), detail page honors the column with newest-photo fallback, `deletePhoto` clears a deleted hero, "Use Newest Photo" to un-set, revisions on set/clear. |
| [36 — Property Key Info](36-property-key-info.md) | 🚧 built 2026-07-31 (PR #43, rebased onto 35); **migration not yet applied**, live walk owed | 35 | **Structure-first half of the "have an opinion on unstructured data" arc.** One additive migration: `properties.wifi_network`/`wifi_password` (member-editable, deliberately not privileged) + `property_contacts.kind` (`emergency`/`on_the_ground`/`service`, default backfills today's panel). Right column becomes Emergencies (fixed 911 + emergency contacts, always first) → Wi-Fi (password + Copy button + **server-rendered Wi-Fi QR** a phone camera joins from) → Contacts on the Ground → Amenities; full-width Service Directory below the grid. Guests see key info by design. Also fixes the edit-form hint that currently *invites* Wi-Fi and passwords into prose; account-credential vault explicitly deferred to 07/08. Intake untouched (that's 37's seam). |
| [37 — Paste Anything Ingestion](37-paste-anything-ingestion.md) | 🟢 ready (2026-07-31) · **hard-blocked on 36**; same builder as 36 recommended | 35 | **The filler half.** Third intake door "Paste Text": paste a Google Doc/email/manual → new `paste` intent (text path shared with dictation: fenced, store-`.txt`-before-model, PRD 33 retention for free) proposes contacts **with kinds** (bulk checklist review, N individually-gated saves), a Wi-Fi card, reminders, and tidied prose via append semantics (existing-blob cleanup happens in the same box). **Credential catch is the load-bearing safety piece**: login/password material is parse-excluded from every proposal, surfaced only as a redacted advisory — Dad's real doc has three plaintext utility logins on a guest-visible page today. Eval with a **scrubbed** Dad-doc fixture (real credentials never enter the repo); 100% planted-credential catch required. First real run = Dad's actual doc, then trim the Loon-A-See blob. |
| [09 — Family messaging](09-family-messaging.md) | 🟡 hold | — | Don't build until the family is actively using the portal — otherwise it's an empty room. Re-evaluate in 2-3 months of usage. |
| [10 — Family timeline](10-family-timeline.md) | 🔵 absorbed | — | Now a slice inside [11 — Family Legacy](11-family-legacy.md). PRD 10 retained for its detailed timeline schema/UX notes. |
| [07 — Trust-doc RAG](07-trust-doc-rag.md) | 🔴 blocked | — | Gated on the trust-doc security decision (see Open decisions). Don't start until that conversation has happened. |
| [08 — Financial dashboard](08-financial-dashboard.md) | 🔴 blocked | — | Same security gate as 07, plus a real scoping conversation with Dan's dad about what data should surface. |

**Parallel-safety legend**: features marked "parallel-safe with" can be developed simultaneously without merge conflicts (different tables, different routes, different components). The shared infrastructure (PhotoUpload, recordRevision, canManageProperty, etc.) is stable — adding to it is fine; reshaping it should be done in a dedicated session.

## Review-and-hardening queue (from the 2026-07-01 full review)

A thorough site review (security + older-user usability + flexibility) ran 2026-07-01/02 and produced **PRDs 25–31**, each scoped as its own small branch so they can be built **in parallel** and reviewed in isolation. Priority: security PRDs (25, 26) first, before the site link is shared more widely. Findings + review checklist are captured in Claude's project memory (`reviewer-checklist`, `security-posture-2026-07`, `usability-bar-older-users`).

| PRD | Title | Severity / kind | Parallel-safe with | Owns (conflict surface) |
|---|---|---|---|---|
| [25](25-ics-guest-exfiltration-fix.md) | Calendar-feed guest exfiltration fix | ✅ shipped + applied to prod (Security HIGH) | all | 1 migration (+ ICS route) |
| [26](26-member-deactivation-lockout.md) | Member deactivation lockout | ✅ shipped + applied to prod (2026-07-02) | 25, 27, 28, 29, 31 (light: `admin/actions.ts` w/ 30) | `is_active()` + **RESTRICTIVE `is_active` policy on all 21 tables + photos bucket** (the RLS guarantee) + admin-guarded `revoke_user_sessions()` RPC (kills live sessions at the source, chose this over a service-role key) + `ics_token` rotation on deactivate + middleware `/deactivated` redirect/page + auth-callback re-login block. |
| [27](27-direct-write-hardening.md) | Direct-write hardening (property cols + peak approval) | ✅ shipped (2026-07-02) · Security MEDIUM — prod-apply pending | all | migrations only |
| [28](28-security-headers-baseline.md) | Security headers & CSP baseline | ✅ shipped (2026-07-02, report-only) · enforce-flip after clean window | all | `next.config.ts` only |
| [29](29-older-user-readability.md) | Older-user readability & touch targets | ✅ shipped (2026-07-02) | all | Tailwind type-scale remap in `globals.css` (`--text-xs` 13px / `--text-sm` 15px) + `--foreground-subtle` contrast (4.65:1) + `ui/button` h-10 / `ui/input` h-10 + booking labels/instruction to 15px sentence case + chip-remove 32px + shell body copy to 16px. |
| [30](30-safe-announced-actions.md) | Safe & announced actions (confirms, aria-live, silent-failure) | ✅ shipped (2026-07-02) | all (coordinate w/ 31 on `admin/*`) | new `confirm-button.tsx` + `form-status.tsx` (the one confirm/status idiom) + wired into every destructive/status/silent-failure site; killed all `window.confirm`/`alert`; archive lightbox focus trap |
| [31](31-copy-and-date-cleanup.md) | Copy & date-format cleanup | 🟢 Polish | all (coordinate w/ 30 on `admin/*`) | `lib/dates.ts` + server-page display + static copy |

Deferred/tracked (not yet PRD'd): **rate limiting / WAF** (login, invites, feedback, ICS) — noted in 28; **feature gaps** surfaced by the review — a global "what's new" activity feed (precursor to shelved [09](09-family-messaging.md)), site-wide **search**, and a **lightbox** on all photo galleries (archive-only today).

## Post-Legacy roadmap (agreed 2026-07-01)

With Family Legacy shipped, Dan prioritized the next wave. **[24 — invite-only access](24-member-invites-access.md) jumped to the front (security) on 2026-07-01** and must ship before the site link is shared. Then: **18 → 19 → 20 → 21 → 22 → 23**. 18/19/20 shipped; 24 has a full PRD; 21/22/23 are captured here and get full PRDs when their turn comes.

| Order | PRD | Idea | Builds on | Notes |
|---|---|---|---|---|
| 0 | [24](24-member-invites-access.md) | **Invite-only access + member invites** (email-bound) | 04, 15, 14 | ✅ full PRD written. **Security-critical, do first.** Closes the open-signup hole; lets any member invite members/guests. |
| 1 | [18](18-legacy-bulk-authoring.md) | Bulk people import + zip photo upload | 11, 12, 05, 17 | ✅ shipped (slices 1-2) 2026-07-01. The content unlock. |
| 2 | [19](19-shell-nav-home.md) | Nav dropdowns + home restructure | shell | ✅ shipped 2026-07-01. Older-user clarity. |
| 3 | [20](20-feedback-suggestions.md) | Family feedback/suggestions form | 14 | ✅ shipped 2026-07-01. Builds the prioritization channel. |
| 4 | 21 (TBD) | **Guest notes + guestbook** — guests staying at a property share their stay | 15 (guest access), properties | Not yet written. Visibility (per-property vs family-wide) + moderation are the open calls. |
| 5 | 22 (TBD) | **Stays + broadcast comms** — link guests/members to a "stay" (booking) and email-blast anyone linked | 06 (booking), 14 (Resend) | Not yet written. **Email-blast consent/unsubscribe is a compliance gate.** Adjacent to the shelved [09 messaging](09-family-messaging.md) — decide if 09 folds in. |
| 6 | 23 (TBD) | **ChatOps agent** — embedded AI agent doing app actions (property/member/profile mgmt, Q&A) mirroring the testing-playbook actions | ~everything; Anthropic API / tool use | Not yet written. **The agent must enforce the same `canManageProperty()`/`is_admin()`/RLS gates as the UI** — wrapping server actions without re-checking authz is the central risk. Largest, most experimental; deliberately last. Lean on latest Claude models (Opus 4.8 / Sonnet 5) + Vercel AI SDK. |

## Round-2 follow-up queue (from the 2026-06-30 testing round)

Small, scoped fixes from [docs/testing-playbook-round-2.md](../docs/testing-playbook-round-2.md). Each is **its own branch/PR** so it can be reviewed in isolation; full spec (problem, scope, files, acceptance criteria) lives in the linked PRD's "Round 2" section. No migrations required by any of these. Parallel-safe with each other (different surfaces).

| Slice | PRD | What | Status |
|---|---|---|---|
| **13-R2** | [13](13-onboarding-welcome-help.md#round-2--testing-feedback-2026-06-30) | Collect **Generation** (+ phone, relationship notes) in the `/welcome` flow so new members stop landing as "Generation Not Set"; de-dupe the generation labels into a shared helper. | ✅ shipped |
| **06-R2** | [06](06-property-booking.md#round-2--testing-feedback-2026-06-30) | **Two-tap** date selection (1st tap = Arrive, 2nd = Last Night) instead of drag/single-tap booking a 1-night stay; move the `/calendar` legend **beneath** the grid. | ✅ shipped |
| **14-R2** | [14](14-booking-notifications.md#round-2--testing-feedback-2026-06-30) | Booker **"request received, pending approval"** email on the pending path (today only admins are notified). | ✅ shipped |
| **14-R2-OPS** | [14](14-booking-notifications.md#round-2--testing-feedback-2026-06-30) | **Supabase Auth custom SMTP** (Resend) + raise auth email rate limits — clears the `email rate limit exceeded` wall that blocked guest testing. **Owner action (Dan), not a code PR.** | ✅ done (2026-06-30, verified) |
| **17-R2** | [17](17-image-performance.md#round-2--testing-feedback-2026-06-30) | Full-res question **answered in-PRD** (decided: not building — 2048px display is by-design; archival-originals path sketched if ever wanted). | ✅ doc-only |
| **15-R2** | [15](15-guest-access.md#round-2--testing-feedback-2026-06-30) | **Guest-appropriate profile editor** — guests currently see the full member editor ("What the Family Sees", branch/generation/relationship). Show a guest variant: name + photo + phone only, Operations framing. | ✅ shipped |

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
