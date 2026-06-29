# 13 — Onboarding & Profile (first-run experience)

**Phase**: 2.5 (adoption) · **Depends on**: 02 (profiles), 05 (photo upload). Image-size work pairs with [17 — Image Performance](17-image-performance.md).
**Status**: 🟢 ready — **top priority before the family readout.** Came out of the testing pass ([docs/testing-playbook.md](../docs/testing-playbook.md) Session A) as the highest-value cluster: new members currently land as "Unnamed" with no guidance, so the directory is a wall of initials and nobody fills in their profile.

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

_Not started. Build first of the post-testing slices. Fill in here when shipped._
