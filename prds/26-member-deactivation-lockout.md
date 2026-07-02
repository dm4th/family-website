# 26 — Member Deactivation Lockout

**Phase**: 6 (security hardening) · **Depends on**: 01 (auth/session), 04 (admin deactivate), 15 (guest deactivation handling)
**Status**: 🟢 ready — **SECURITY, HIGH.** Its own session/branch.
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
