# 13 — Onboarding & Profile (first-run experience)

**Phase**: 2.5 (adoption) · **Depends on**: 02 (profiles), 05 (photo upload). Image-size work pairs with [17 — Image Performance](17-image-performance.md).
**Status**: ✅ shipped (2026-06-29) — all four slices: guided `/welcome` first-run flow (gated on `profiles.onboarded_at`), Family Branch dropdown, inline profile photo, and the welcome panel + `/help` guide. New members are routed through onboarding before the app and never see "Unnamed". Merged in PR #7; migration `20260629000001_onboarding.sql` (additive: column + backfill) is **applied to prod**. A cross-PR redirect loop with [15 — Guest Access](15-guest-access.md) (un-onboarded guests bounced to `/welcome`) was hotfixed in `a01354b` — guests are now exempt from the onboarding gate.

---

## Why

The site is opening to the whole family — multi-generational, eldest-generation-first. Today a new member's first login (via magic link) drops them on the dashboard with a profile that's blank: the `handle_new_user` trigger sets `full_name` only if an invite or auth metadata carried one, otherwise it's null and the UI shows **"Unnamed"**. There's no prompt to fix it, so:
- the **Directory** (`/family`) shows initials instead of faces (the gap-log "/family → initials" finding is really this — the directory already renders photos when present; nobody has one),
- relationships/branches are empty, and
- the family's first impression is a cold, empty room.

The fix is a **guided first-run experience** that greets new members and walks them through creating their profile, plus the profile-edit improvements that make it painless.

## Onboarding (read first if you're picking this up cold)

1. **Read** [CLAUDE.md](../CLAUDE.md), [00-master-plan.md](00-master-plan.md), [docs/testing-playbook.md](../docs/testing-playbook.md) (Session A + its inline notes are the source of this PRD), then this file.
2. **You will reuse**:
   - `PhotoUpload` (`src/components/photo-upload.tsx`) — drag-drop + mobile camera, direct-to-Storage; already used elsewhere.
   - `setAvatarFromPhoto` + `updateOwnProfile` in [src/app/(app)/profile/actions.ts](../src/app/(app)/profile/actions.ts).
   - `RichTextField` (`src/components/authoring`) — already on the bio field.
   - The `handle_new_user` trigger + `profiles` table ([supabase/migrations/20260523000001_schema.sql](../supabase/migrations/20260523000001_schema.sql)).
   - `SalonPanel` (Family mode) + the `family-office-ui` / `page-mode-orchestrator` skills — this is **Family mode** (burgundy).
3. **Casing**: per the family decision, the whole site moves to **Title Case** for nav/titles/buttons — see [16 — UI Polish & Copy](16-ui-polish-copy.md). Write new UI copy here in Title Case.

## Goal

A family member's first login ends with a **named profile, a photo, and a family branch set** — and they understood what the site is for along the way — without ever seeing the word "Unnamed" or hunting for an edit page.

## In scope — four slices

### 1 · Guided "create your profile" first-run flow  ← the core
- Detect an **incomplete/new profile** — use `profiles.onboarded_at` (new column, null = not onboarded) as the primary gate; treat a null/blank `full_name` as a strong signal too.
- On first login, route incomplete members into a **focused, friendly create-profile experience** (a `/welcome` route or a guided `/profile/edit?first=1` — decide below) instead of the cold dashboard. Steps, in plain language: **your name → your family branch → a photo → a short bio (optional)**. Warm Family-mode copy, big targets, works on an iPad.
- On completion, **stamp `onboarded_at`** and drop them on the dashboard with a brief welcome.
- Never render "Unnamed" — fall back to first-name-from-email or a gentle "Add your name" prompt until set.

### 2 · Family Branch dropdown
- Replace the free-text `family_branch` `<Input>` ([profile-edit-form.tsx](../src/app/(app)/profile/edit/profile-edit-form.tsx)) with a **dropdown**. The branches are the three Gen-1 siblings — existing data uses the format **"Peter's Family" / "Andy's Family" / "Peggy's Family"** (see the seeded `people`/`profiles`); match that format so it reconciles with existing rows.
- Decide source (below): a small constant vs. a `family_branches` reference table. Lean constant for 3 values, but make it trivially extendable (new branches will appear as the family grows).

### 3 · Inline photo on profile edit
- Embed **`PhotoUpload` + "use as avatar"** directly on the profile-edit page so a member sets their photo **without clicking through to a separate page** (testing note: "should be able to do photo edits and uploads directly from the edit profile page"). The avatar must update everywhere it appears (directory, header, calendar).
- At upload, **nudge toward a reasonable size** (or offer the Google Photos path) — the real downscaling fix lives in [17 — Image Performance](17-image-performance.md); this slice surfaces the prompt and links to that behavior.

### 4 · Welcome panel + `/help` (the original PRD 13 scope, retained)
- **First-login welcome** — a short, dismissible Family-mode panel on the dashboard for members whose `onboarded_at` was just set; one clear "here's where to start."
- **`/help` page** — an always-available, plain-language guide (logging in, your profile, the directory, properties + wiki editing, booking + calendar subscribe, photos). Markdown via the existing `Markdown` component; eldest-gen tone; no jargon; reachable from the user menu. See [[legacy-and-authoring-direction]].

## Pre-flight decisions (decide before code)

| Decision | Lean | Why |
|---|---|---|
| Onboarding gate | `profiles.onboarded_at timestamptz` (null = show flow) | One nullable column; RLS-trivial; lets us re-show after big changes. |
| Where the flow lives | A dedicated `/welcome` (or `/onboarding`) route, redirected to from `proxy.ts`/layout when `onboarded_at is null` | Cleaner than overloading `/profile/edit`; a guided multi-step feel. |
| Required vs optional | Name + branch **required**; photo + bio **encouraged, skippable** | Don't block entry on a photo; but never leave them "Unnamed." |
| Can they skip entirely? | Allow "finish later" but keep nudging (a soft banner) until name+branch set | Respect autonomy without leaving empty profiles forever. |
| Family-branch source | Constant list in `Peter's Family / Andy's Family / Peggy's Family` format; revisit a table if branches multiply | 3 values today; keep it dead simple, easy to extend. |
| "Unnamed" fallback | First name from email, else "Add your name" CTA | Never show a dead label. |

## Likely file layout

```
supabase/migrations/
  YYYYMMDD_onboarding.sql           # profiles.onboarded_at; (optional) family_branches table
src/lib/db/schema.ts                # mirror

src/app/(app)/welcome/
  page.tsx                          # guided create-profile flow (multi-step, Family mode)
  actions.ts                        # completeOnboarding() → sets fields + onboarded_at
src/app/(app)/profile/edit/
  profile-edit-form.tsx             # family-branch dropdown + inline PhotoUpload/avatar
src/app/(app)/help/
  page.tsx                          # plain-language guide (Markdown)
src/components/
  welcome-panel.tsx                 # dismissible first-login dashboard panel
src/proxy.ts (or the (app) layout)  # redirect incomplete profiles to /welcome
```

## Verification recipe

1. Brand-new invited member's first login → lands in the **guided flow**, not the cold dashboard; "Unnamed" never appears.
2. Set name + pick a **branch from the dropdown** + add a photo → finish → dashboard shows a brief welcome; `onboarded_at` is set; the **Directory now shows their face**, not initials.
3. The avatar shows everywhere (directory, header, any calendar attribution).
4. Add/replace the photo **inline on `/profile/edit`** — no separate page needed.
5. `/help` reachable from the user menu; readable on an iPad; no jargon; Title Case throughout.
6. Existing onboarded members don't see the welcome flow or panel.

## Implementation

Shipped 2026-06-29 (PR #7). All four slices landed together. No new infrastructure — reuses `PhotoUpload`/`AddPhotosModal`/`PhotoGallery`, `RichTextField`, `setAvatarFromPhoto`, `resolveAvatarUrls`, `SalonPanel`/`PageIntro`, and the existing self-update RLS path.

**Gate + data**

- `supabase/migrations/20260629000001_onboarding.sql` — adds `profiles.onboarded_at timestamptz` (null = not onboarded). **Backfills** `onboarded_at` for existing rows that already have a `full_name`, so established members skip the flow; genuinely blank ("Unnamed") rows stay null and get guided. No new RLS/trigger: `profiles: self update` already permits the write and `guard_profile_privileged_columns()` only blocks `role`/`deactivated_at`.
- `src/lib/db/schema.ts` — Drizzle mirror (`onboardedAt`).
- `src/lib/family-branches.ts` — `FAMILY_BRANCHES` constant (`Peter's / Andy's / Peggy's Family`), the single source for the dropdown.
- `src/lib/display-name.ts` — `displayName()` / `firstNameFromEmail()`; the "never render Unnamed" fallback.
- `src/lib/profile-photos.ts` — `getProfilePhotos()` (mirrors the profile-detail query) + `avatarStoragePath()`, shared by the inline section.

**Slice 1 — guided first-run flow**

- `src/app/welcome/{page.tsx,welcome-flow.tsx,actions.ts}` — a focused, nav-less `/welcome` (outside the `(app)` group). Name + family **required**, photo + bio optional. `completeOnboarding()` stamps `onboarded_at` and redirects to `/?welcome=1`; `skipOnboarding()` ("Finish later") stamps `onboarded_at` only so the member isn't trapped.
- `src/app/(app)/layout.tsx` — the redirect gate: `onboarded_at is null` → `/welcome`. Lives in the layout (not `proxy.ts`) so it's a single indexed read on an already-DB-touching path; `/welcome` sits outside `(app)` so it can't loop. **Guests are exempt** (`resolveViewer()` is checked first): a brand-new guest also has `onboarded_at = null`, but `/welcome` isn't in the PRD 15 guest route allow-list, so gating them there bounced off the guest middleware and looped (`ERR_TOO_MANY_REDIRECTS`). Guests don't create a family profile, so they skip the gate entirely (hotfix `a01354b`, caught by the live guest e2e test).

**Slice 2 — Family Branch dropdown**

- `src/components/family-branch-select.tsx` — native `<select>` styled like `Input` (iPad-friendly, zero extra JS); surfaces an unknown legacy value as a selectable option so a save never silently drops it. Used on profile-edit and in `/welcome`.

**Slice 3 — inline profile photo**

- `src/components/profile-photos-section.tsx` — server component pairing `AddPhotosModal` + `PhotoGallery` (with `canSetAvatar`). Embedded on `src/app/(app)/profile/edit/page.tsx` (and reused as the `/welcome` photo step), so photos are managed without leaving the page. The "Manage your photos →" link was replaced with "View your profile →".
- "Unnamed" replaced via `displayName()` in `src/app/(app)/family/page.tsx` and `family/[id]/page.tsx` (own blank profile shows an "Add your name" CTA).

**Slice 4 — welcome panel + `/help`**

- `src/components/welcome-panel.tsx` — now gated on `?welcome=1` (the post-onboarding landing), not on `onboarded_at` (the flow sets that). Dismiss strips the query param client-side; no DB write.
- `src/components/profile-nudge.tsx` — soft, session-dismissible banner on the dashboard for "Finish later" members with no name yet.
- `src/app/(app)/help/{page.tsx,help-content.ts}` — plain-language guide via `Markdown` (salon tone); linked from the user menu and the welcome panel; honest about the no-booking-notifications gap (see [14 — Booking Notifications](14-booking-notifications.md)).

**Decisions made during build**

- **Redirect gate in the layout, `/welcome` outside `(app)`** — avoids a loop without special-casing paths in middleware, and keeps the flow nav-less/focused.
- **Backfill instead of a runtime "has a name?" check** — one-time migration write means the gate is a clean `onboarded_at is null`, and existing members aren't dragged through onboarding.
- **"Finish later" is honored** — it stamps `onboarded_at` so the gate doesn't re-trap them; the dashboard nudge (name-only trigger, so established members aren't nagged) keeps it visible.
- **No `Select` primitive added** — a styled native `<select>` is enough for 3 values and is the better touch control.
- **Guests are exempt from the onboarding gate** (post-merge learning) — a not-yet-onboarded guest also has `onboarded_at = null`, and gating them to `/welcome` (not in the guest allow-list) looped against the PRD 15 middleware. The gate now resolves the viewer first and skips guests. Only surfaced once #7 and #8 were both live — neither PR showed it in isolation.

**Verification** — `tsc --noEmit`, `eslint`, and `npm run build` all clean; `/welcome` and `/help` register as dynamic routes. Recipe items 1–6 covered in code. Live walk-through confirmed: the prod migration is applied and the guest end-to-end test exercised the onboarding gate (which is what surfaced the guest-exemption hotfix `a01354b`). Copy was later polished in PR #11 (welcome flow + panel, `/help`, em-dash scrub, re-cased labels).

**Follow-ups**

- ~~Migration not yet applied to prod~~ — **resolved**: `20260629000001_onboarding.sql` (additive column + backfill) is applied to prod and live-verified. The sibling guest-access migration was renumbered to `…002` to avoid a version collision (per the PR #8 review).
- Title Case sweep of older copy is [16 — UI Polish & Copy](16-ui-polish-copy.md); new copy here is already Title Case.
- Real image downscaling on upload is [17 — Image Performance](17-image-performance.md); this slice surfaces the inline uploader but doesn't downscale.
- `displayName()` fallback is name-or-"Member" (directory/profile don't select email); wire email through if first-name-from-email is wanted there too. Admin tables still show "Unnamed" (out of family-facing scope).
