# 24 — Member Invites & Invite-Only Access

**Phase**: 5 · **Depends on**: 04 (invitations table + admin invite flow), 15 (guest access + `property_guests` + `grant_property_id`), 14 (Resend magic-link delivery, live)
**Status**: 🟢 ready — scoping + model agreed 2026-07-01. **Security-critical: this is the top priority, ahead of 21/22/23.** Its own session/branch.

---

## Why this exists (the hole)

The site is meant to be private to invited family. It is **not**, today. Any new sign-in — magic link **or** "Sign in with Google" — is granted a **`member`** profile by default, because `handle_new_user()` falls back to `v_role := 'member'` when no invitation matches ([20260629000002_guest_access.sql:135](../supabase/migrations/20260629000002_guest_access.sql)). So anyone who finds the URL can enter any email, tap the link, and see everything.

Dan caught this before broadcasting the link to family. **Nothing must be shared until this ships and is tested.**

## The decision: email-bound invites (not shareable links)

We considered member-generated **shareable invite links** and rejected them: a link is a bearer credential (whoever holds it gets in), which is a real leak risk for a site that will hold trust/financial material. **Email-bound** invites tie each invitation to one address, so a forwarded link is useless to anyone but the intended person. It's also *less* to build here, because the existing invitation system is already email-bound.

Locked decisions (2026-07-01):
- **Identity = email.** Sign-in stays the existing magic link (live via Resend) + Google. No phone/SMS (paid infra, unneeded).
- **Any member can invite** a new **member** or a **guest scoped to a property** (any property). Not admin-gated.
- **Inviting a new _admin_ stays admin-only** (privilege-escalation guard — a member must not be able to mint an admin). Confirm with Dan; defaulted on.
- **Graceful rejection**: a non-invited sign-in lands on a friendly "you need an invitation" page, not a raw error.

## Onboarding (read first if you're picking this up cold)

1. **Read** [CLAUDE.md](../CLAUDE.md), [00-master-plan.md](00-master-plan.md), [04-admin-invitations.md](04-admin-invitations.md), [15-guest-access.md](15-guest-access.md), then this file.
2. **Consult** `.agents/skills/supabase` (Auth + RLS) and `supabase-postgres-best-practices` before touching the trigger or invitations RLS.
3. **The system already does most of this** — do not rebuild it:
   - `invitations` table: `email`, `role`, `invited_by`, `status`, `token`, `expires_at`, `accepted_at`, **`grant_property_id`** (guest invites). Email-bound, unique-pending-per-email, 30-day expiry.
   - `handle_new_user()` (current def in [20260629000002](../supabase/migrations/20260629000002_guest_access.sql)): matches the invited email, adopts its role, marks the invitation accepted, and **materializes the guest's `property_guests` grant** from `grant_property_id`. This all stays; we only change the no-match default.
   - `createInvitation` / `sendInviteMagicLink` / `revokeInvitation` in [admin/actions.ts](../src/app/(app)/admin/actions.ts) — the actions exist; they're just `requireAdmin`-gated and live only on `/admin`.
   - Magic-link + Google sign-in in [(auth)/login/actions.ts](../src/app/(auth)/login/actions.ts); callback in [auth/callback/route.ts](../src/app/auth/callback/route.ts).

## Goal

Only people a family member has invited (by email) can get into the site. Any member can invite a new member, or a guest scoped to a property, in a few taps, and the invitee signs in with the same magic link everyone uses. Everyone else bounces off a calm "you need an invitation" page.

## Pre-flight decisions

| Decision | Recommendation | Why |
|---|---|---|
| **Enforcement point** | **Hard-block in `handle_new_user()`**: `if not found then raise exception`. Rolls back the `auth.users` insert, so no account is created | Single choke point for *both* magic link and Google OAuth. The standard Supabase allowlist pattern. No RLS changes, no new roles (a "pending" role would pass `not is_guest()` and leak member access). |
| **Existing users** | Untouched | The trigger fires only on account *creation*. Dan, Peter, and the 3 deactivated test rows already exist, so they keep signing in. |
| **Who can invite** | Any authenticated **member** (not guest). **admin** role invites remain admin-only | Matches the wiki posture while preventing member → admin escalation. |
| **Where members invite** | A member-reachable **"Invite" page** for member invites; **"Invite a guest"** on each property page for guest+property invites | Guest invites belong where the property is; member invites are a general action. |
| **Graceful rejection** | A public `/welcome-invite` (or `/no-invite`) page; `/auth/callback` catches the trigger error and redirects there | Turns "Database error saving new user" into a human message. |
| **`shouldCreateUser`** | Leave `true` for now | The trigger is the real gate. (A non-invited email still gets a link, but account creation fails at the trigger.) Tightening login UX is a follow-up. |
| **Revocation** | Inviter or admin may revoke a **pending** invite; revoking an *accepted* member = deactivate them (existing `setMemberActivation`) | Reuse the shipped deactivation path; don't invent a second one. |

## In scope

### Slice 1 · Close the hole (enforcement) + graceful rejection
- **Migration**: `create or replace handle_new_user()` — identical to today **except** replace the silent `member` default with, when no valid invitation is found, `raise exception` (so the signup rolls back). Keep the invitation-match, role adoption, accepted-marking, and guest-grant materialization exactly as-is.
- **`/auth/callback`**: detect the failed `exchangeCodeForSession` / user-creation error and redirect to the rejection page instead of surfacing a raw error. (Do the same for the Google OAuth failure path.)
- **Rejection page** (public, added to the auth-gate allowlist in [proxy.ts](../src/proxy.ts) / [middleware.ts](../src/lib/supabase/middleware.ts)): calm copy, "This site is private to our family. Ask whoever invited you to send an invitation to this email address."
- **Verify existing users still sign in** (they must — this is the scary part).

### Slice 2 · Let members invite
- **Ungate** `createInvitation` + `sendInviteMagicLink` from `requireAdmin` to "any authenticated non-guest." Keep `revokeInvitation` to inviter-or-admin.
- **Guard admin invites**: `createInvitation` rejects `role = "admin"` unless the caller `is_admin()`.
- **`invitations` RLS**: allow an authenticated non-guest to INSERT their own invitation (`invited_by = auth.uid()`), with a check that blocks `role = 'admin'` for non-admins; SELECT own + admin-all; UPDATE (revoke) inviter-or-admin. (Today these actions run under the caller's session, so RLS must permit members, not just admins.)
- **Member invite UI**:
  - A member-reachable **"Invite a Family Member"** surface (email + optional note) — e.g., a small `/invite` page linked from the user menu and/or the Directory.
  - **"Invite a Guest"** control on the property page (Operations mode) → email + this property, creating a `guest` invitation with `grant_property_id`.
  - After creating: show the pending invite and offer **"Email the sign-in link"** (`sendInviteMagicLink`) + plain instructions to share.
- **Pending list for members**: a member sees invitations they created (status) and can revoke a pending one. Admins keep the full `/admin` view.

## Out of scope (initial)
- Shareable (non-email-bound) invite links — explicitly rejected (bearer-token risk).
- Phone / SMS auth.
- Self-serve "request access" queue.
- Bulk invite (a member CSV of emails) — possible later; not now.
- Changing the guest access model itself (PRD 15) — this only adds the invite entry point.

## Verification recipe (do ALL before inviting real family)
1. **Existing users unaffected** — Dan and Peter sign out and back in: still work. (Non-negotiable gate.)
2. **Invited member** — as a member, invite a fresh email → open the magic link in an incognito window → lands in `/welcome` as a **member**.
3. **Uninvited blocked** — in incognito, go to `/login`, enter a **never-invited** email, tap the link → **no access**; lands on the rejection page; **no member profile is created** (check `profiles`).
4. **Google path blocked** — sign in with Google using an uninvited account → same rejection, no profile.
5. **Guest invite** — from a property page, invite a guest → they sign in → guest scoped to **only** that property (full negative suite from PRD 15 still holds).
6. **Member cannot mint admin** — a non-admin member's attempt to create a `role=admin` invite is rejected (UI + RLS).
7. **Revoke** — revoke a pending invite → that email can no longer redeem.
8. **Apply to prod + repeat 1–5 live** before the link is shared.

## Likely file layout

```
supabase/migrations/YYYYMMDD_invite_only.sql   # handle_new_user raise-on-no-invite; invitations RLS for members
src/app/auth/callback/route.ts                  # catch signup rejection -> redirect to rejection page
src/proxy.ts + src/lib/supabase/middleware.ts   # allowlist the rejection page
src/app/(auth)/no-invite/page.tsx               # graceful "you need an invitation" page
src/app/(app)/admin/actions.ts                  # ungate createInvitation/sendInviteMagicLink; admin-only for role=admin
src/app/(app)/invite/                           # member-facing "Invite a Family Member" + pending list
src/app/(app)/properties/[slug]/…               # "Invite a Guest" control (guest + this property)
```

## References / reuse
- `handle_new_user()` + `invitations` + `grant_property_id` (this is mostly a one-line trigger change)
- `createInvitation` / `sendInviteMagicLink` / `revokeInvitation` (ungate + guard)
- `is_admin()` / `is_guest()` / `resolveViewer()` for gating; `setMemberActivation` for revoking accepted members
- Magic-link delivery (Resend SMTP, live); `.agents/skills/supabase` for the trigger + RLS

## Implementation

_Filled in per slice as each ships._

- **Slice 1 — Enforcement + rejection page**: _status: not started_
- **Slice 2 — Member invite UI + ungate**: _status: not started_
