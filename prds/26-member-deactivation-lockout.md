# 26 — Member Deactivation Lockout

**Phase**: 6 (security hardening) · **Depends on**: 01 (auth/session), 04 (admin deactivate), 15 (guest deactivation handling)
**Status**: ✅ shipped (2026-07-02) — **SECURITY, HIGH.** Built on its own branch; **migration not yet applied to prod** (see Implementation). Its own session/branch.
**Parallel-safe with**: 25, 27, 28, 29, 31. **Coordinate with 25** (both may touch the deactivation path / `ics_token` rotation) and lightly with 30 (both may touch `admin/actions.ts`) — different functions, easy to merge.

---

## Why this exists (the hole)

Deactivating a member is **cosmetic**. `setMemberActivation` ([admin/actions.ts:113](../src/app/(app)/admin/actions.ts)) only stamps `profiles.deactivated_at` and deletes the person's `property_guests` grants. Enforcement is entirely by convention:

- Listing pages filter `.is("deactivated_at", null)` — hides them from view, nothing more.
- `is_admin()` / `is_guest()` consider deactivation, but **no RLS policy** and **no middleware check** blocks a deactivated **member**.
- The proxy only redirects **unauthenticated** users ([middleware.ts:50](../src/lib/supabase/middleware.ts)).
- Nothing revokes their Supabase session, and they can request a fresh magic link any time (invite-only only blocks *new* accounts; this account already exists).

Net: a deactivated member keeps **full read/write** to profiles, properties, bookings, photos, people, stories — via both the app and direct PostgREST — because every core policy is `to authenticated using(true)` / `not is_guest()`, and a deactivated member is still `role='member'`, not a guest.

The comment at [admin/actions.ts:124-127](../src/app/(app)/admin/actions.ts) and the accepted-gap note in [PRD 24 §Implementation](24-member-invites-access.md) both acknowledge this. It's low-stakes today (only test accounts are deactivated) but is a **hard blocker for the financial-data bar** and should close before the family grows.

## Goal

Deactivating anyone (member, admin, or guest) fully locks them out: no new sign-in, no session survival, no DB read/write — enforced at the database, not just the UI.

## Pre-flight decisions

| Decision | Recommendation | Why |
|---|---|---|
| **Primary enforcement** | A DB-level gate: an `is_active()` SECURITY DEFINER helper (`deactivated_at is null` for `auth.uid()`), added to the core read/write policies — OR bake `deactivated_at is null` into `is_guest()`'s sibling checks. | RLS is the real guarantee (matches the site's stated posture). UI/middleware are UX layers only. |
| **Policy strategy** | Prefer a single reusable predicate. Add `and public.is_active()` to the authenticated USING/CHECK of the broad policies (profiles, properties, bookings, photos, people, relationships, albums, events, stories, feedback, joins). Keep admin-management policies working (an admin re-activating must still pass). | One helper, applied consistently, is auditable. Avoid per-table bespoke logic. |
| **Session kill** | On deactivate, call the Supabase Admin API (`auth.admin.signOut(userId)` / delete refresh tokens) so the live session dies immediately. Requires the service-role key server-side (a Server Action, never client). | Without this, their current cookie still authenticates until expiry even with RLS closed. |
| **Middleware** | Add a deactivation check to `updateSession` (one RPC, like the existing `is_guest` call) → redirect deactivated users to a `/deactivated` page. | Fast UX block + belt-and-suspenders; RLS is the guarantee. |
| **New sign-in** | Block re-login: either in the callback (check `deactivated_at` post-exchange and sign them out) or via the session gate above catching them on first request. | Invite-only doesn't cover existing-but-deactivated accounts. |
| **ICS token** | Null/rotate `ics_token` on deactivate (coordinates with PRD 25, which also checks deactivation in the feed fn). | Kills leaked feed URLs. |
| **Service-role key** | Introduce it as a server-only env (`SUPABASE_SECRET_KEY`), used ONLY in trusted Server Actions. Document the boundary; never `NEXT_PUBLIC_`. | First privileged-admin operation; sets the pattern for future admin tooling. |

## In scope
- **Migration**: `is_active()` helper + apply the predicate across the broad authenticated policies; ensure admin-management paths still function.
- **`setMemberActivation`**: session revocation (Admin API) + `ics_token` rotation; keep the existing guest-grant cleanup.
- **Middleware**: deactivation redirect; `/deactivated` page added to the public-path allowlist.
- **Re-login block** in the auth callback (or rely on the session gate — verify which fires first).

## Out of scope
- Rewriting the general "every member sees everything" model — that's the financial-scoping conversation (PRDs 07/08), not this.
- Rate limiting / MFA (PRD 28 + future).

## Verification recipe
1. **Active member unaffected** — normal member reads/writes work.
2. **Deactivate mid-session** — deactivate a member who has a live session; their next request → locked out (redirect + RLS denies direct PostgREST read/write). Verify with a direct `supabase.from('profiles').select()` under their token returns nothing/denied.
3. **Re-login blocked** — deactivated member requests a fresh magic link, opens it → no access.
4. **Admin re-activate** — reactivating restores access.
5. **Guest path intact** — deactivating a guest still pulls grants (existing behavior) and now also fails RLS.
6. **ICS dead** — deactivated user's feed URL → 401 (with PRD 25 landed).
7. Apply to prod + re-run 1–4 live.

## Likely file layout
```
supabase/migrations/20260702000002_deactivation_lockout.sql  # is_active() + policy predicates
src/app/(app)/admin/actions.ts                               # setMemberActivation: signOut + rotate ics_token
src/lib/supabase/middleware.ts                               # deactivation redirect
src/app/(auth)/deactivated/page.tsx                          # calm "account is inactive, contact an admin" page
src/lib/supabase/admin.ts                                    # service-role client (server-only) — NEW, document boundary
.env.local.example                                           # SUPABASE_SECRET_KEY (server-only) doc
```

## Reviewer sign-off (I check these)
- [ ] Deactivated member is denied by **RLS** (proven via direct PostgREST, not just the UI hiding them).
- [ ] Service-role key is server-only; never imported into a client component or exposed via `NEXT_PUBLIC_`.
- [ ] Admin re-activation still passes every policy it needs.
- [ ] `is_active()` is `security definer`, `search_path=''`, `revoke all` + explicit grant.
- [ ] No policy accidentally locks out the admin doing the deactivating.
- [ ] Live session actually dies (not just future logins).

---

## Implementation (shipped 2026-07-02)

**Branch**: `claude/sharp-roentgen-7028dd`. tsc + eslint + `next build` all green. **Merged** (PR #27 → merge commit `f1e6c01`) and **applied to prod** (`supabase migration list` shows Local==Remote for `20260702000002`). **Live-verified** — see "Prod verification" below.

### Key files
- **`supabase/migrations/20260702000002_deactivation_lockout.sql`** (new) — the whole DB guarantee:
  - `public.is_active()` — SECURITY DEFINER, `stable`, `search_path=''`, `revoke all` + `grant execute to authenticated`. True iff the caller has a profile with `deactivated_at is null`. Mirrors the `is_admin`/`is_guest` posture.
  - A **`RESTRICTIVE` `is_active()` policy on all 21 authenticated tables** (`profiles, properties, property_contacts, photos, photo_subjects, photo_people, albums, album_photos, revisions, invitations, bookings, people, relationships, events, event_people, event_photos, stories, story_people, feedback, property_admins, property_guests`) **+ the `photos` storage bucket**. `for all` covers select/insert/update/delete in one policy; restrictive = AND-combined with the existing permissive policies, so a deactivated user fails every command everywhere.
  - `public.revoke_user_sessions(uuid)` — admin-guarded SECURITY DEFINER RPC that `delete`s the target's `auth.sessions` so a live session can't refresh into a new access token.
- **`src/app/(app)/admin/actions.ts`** — `setMemberActivation` now, on deactivate: rotates `ics_token` (kills leaked feed URLs) and calls `revoke_user_sessions` (best-effort — RLS is the guarantee). Guest-grant cleanup unchanged.
- **`src/lib/supabase/middleware.ts`** — an `is_active` RPC check in `updateSession` (before the guest check) redirects a deactivated user to `/deactivated`; that path is added to the public allowlist. Only redirects on an explicit `false` (transient RPC error can't strand an active member).
- **`src/app/(auth)/deactivated/page.tsx`** (new) — calm BriefingPanel "your access is paused" page with a sign-out form (server action posting to the allowlisted path).
- **`src/app/auth/callback/route.ts`** — post-exchange `is_active` check; a deactivated re-login is signed back out and sent to `/deactivated`.

### Decisions / deviations
- **RESTRICTIVE policy over rewriting ~40 permissive policies.** One auditable global gate per table (`grep "active only"`), and it avoids editing the intricate guest-aware policies that sibling PRDs 25/27/30 also touch — near-zero merge risk.
- **DB-level session kill instead of the PRD's proposed service-role key.** The whole codebase already does privileged writes through admin-guarded SECURITY DEFINER functions; an admin-guarded `revoke_user_sessions()` RPC is reliable, testable, and — crucially for a *security* PRD — avoids adding an all-RLS-bypassing secret to the Next.js runtime for a single operation that doesn't need to bypass RLS. **No `SUPABASE_SECRET_KEY` / `src/lib/supabase/admin.ts` was introduced.** If a future op genuinely must bypass RLS from app code, add the service-role client then. (Reviewer: easy to swap in the service-key path if you'd rather establish that precedent now — flag it.)
- **Enforcement timing.** RLS denies data to the still-valid current access token *immediately*; middleware redirects on the next request; `revoke_user_sessions` prevents refresh — so a deactivated user is hard-logged-out within one access-token lifetime (≤1h), with zero data access in the interim.

### Prod verification (reviewer, 2026-07-02)
Both `+guest`/`+guest2` test accounts happened to be deactivated already, giving two independent confirmations on prod:
- **RLS lockout (the guarantee):** a deactivated account holding a **valid, non-expired session JWT** sees **0 rows including its own profile** via direct PostgREST; `is_active` RPC returns false. This is exactly the "deactivate mid-session → direct PostgREST denied" case — a still-valid token gets nothing.
- **Re-login blocked + calm landing:** a deactivated account completing a fresh magic-link exchange (clean PKCE) lands on **`/deactivated`** with **no session** (the callback signs it back out). The `/deactivated` page renders correctly.
- **Active-user-unaffected:** guaranteed by construction — `is_active()` returns true for an active caller, so the restrictive `AND is_active()` is a no-op and prior access is unchanged; prod is live serving active members.
- Testing gotcha logged: the dev server must run **main's** code, not a stale worktree checkout, or the middleware/callback gates appear absent (they live only in app code; RLS still denies data regardless).

### Follow-ups
- Optional: a live positive control of the middleware mid-session redirect on a freshly-deactivated *active* account (needs an active test account; both test guests are currently deactivated). Low value — the redirect shares the exact `is_active` RPC + `/deactivated` target proven in the callback re-login block.
- No guard against deactivating the **last admin** (would brick admin access) — worth a small guard eventually.
- Perf sweep: wrap `is_active()`/`is_guest()` policy calls in `(select ...)` for once-per-statement eval before tables grow (codebase-wide, not specific to this PRD).
- Coordinates with **PRD 25** (feed-function deactivation check) — both prod-applied together 2026-07-02.
