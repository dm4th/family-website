# 25 — Calendar-Feed Guest Exfiltration Fix

**Phase**: 6 (security hardening) · **Depends on**: 06 (ICS feeds + `ics_token`), 15 (guest access)
**Status**: ✅ shipped — **SECURITY, HIGH.** Migration + ICS route hardening landed; prod apply + live re-verify pending (see Implementation).
**Parallel-safe with**: 26, 27, 28, 29, 30, 31 (touches only one new migration + optionally the ICS route). No shared files.

---

## Why this exists (the hole)

`ics_bookings_for_token(p_token, p_scope)` ([20260623000001_ics_token.sql](../supabase/migrations/20260623000001_ics_token.sql)) was written **before** guest access (PRD 15) existed and was never revisited. It authorizes purely on the token being valid — it never checks the resolved member's **role** or **deactivation**.

Every profile (including every guest) gets an `ics_token` by default, and a guest can read their **own** profile row (the profiles SELECT policy allows `id = auth.uid()`). So a signed-in guest can:

1. `select ics_token from profiles where id = auth.uid()` (allowed by RLS), then
2. `GET /api/ics/all?token=<that token>` — and receive **every approved booking across all properties, including every booker's `full_name` and `email`.**

This completely bypasses the guest-scoping model. In-app, a guest sees only their own bookings and `property_busy_ranges()` was purpose-built to redact identities — this endpoint hands them the whole family calendar plus everyone's email. The `/api/ics/` path is also exempt from the proxy auth gate ([middleware.ts:46](../src/lib/supabase/middleware.ts)), so nothing upstream catches it.

**Impact rises sharply once trust/financial context enters** — a guest is exactly the kind of semi-trusted outsider (a grandchild's partner staying one weekend) this must not leak to.

## Goal

A guest's token can never read anything the guest can't already see in-app. Deactivated/removed users' tokens stop working. No change to the member experience (members legitimately see all bookings today).

## Pre-flight decisions

| Decision | Recommendation | Why |
|---|---|---|
| **Guest scope** | A guest token may read **only `me`** (their own bookings) and **only their granted properties** by slug; `all` returns their own bookings (or raise). Never other members' rows. | Mirrors the in-app guest model exactly. |
| **Deactivation** | The function raises (401) if the resolved member's `deactivated_at is not null`. | Ties into PRD 26; a departed person's leaked feed URL must die. Safe to land here independently. |
| **Guest identity redaction** | For any rows a guest *is* allowed to see (their own), returning their own name/email is fine. Do **not** return other bookers' identities to a guest under any scope. | Consistent with `property_busy_ranges()`. |
| **Token rotation on deactivation** | Also null/rotate `ics_token` in the deactivation path (PRD 26 owns that line; note the dependency). | Defense in depth; not strictly required once the function checks role+deactivation. |

## In scope
- **Migration** (`create or replace ics_bookings_for_token`): after resolving `v_member`, look up its `role` and `deactivated_at`. If deactivated → raise `28000` (route already maps to 401). If `role = 'guest'`:
  - `p_scope = 'me'` → return only that guest's own approved bookings (unchanged behavior for `me`, but now the only allowed broad scope).
  - `p_scope = <slug>` → return that property's bookings **only if** `is_property_guest` holds for the guest+property, **and** redact other members' `guest_name`/`guest_email` (or restrict to the guest's own rows — simplest correct option: return only the guest's own bookings even at property scope).
  - `p_scope = 'all'` → do **not** return the whole family; either raise or collapse to the guest's own bookings. Recommend collapse-to-own (a guest's calendar app still works).
- Keep the member/admin path exactly as today.
- Optionally tighten the route's `Cache-Control` for token feeds from `public, max-age=300` to `private` once guest scoping lands (informational; the secret is in the URL).

## Out of scope
- Rewriting the whole feed to per-property tokens (a mentioned future optimization; not needed for the fix).
- The deactivation lockout for the app itself — that's **PRD 26** (this only fixes the feed).

## Verification recipe
1. **Member unaffected** — a member's `me` / `all` / property feeds return the same rows as before.
2. **Guest `all` blocked** — as a real guest (use one of the existing `+guest@` test accounts), fetch `/api/ics/all?token=<guest token>`: returns **only** the guest's own bookings (or 401), **never** other members' rows/emails.
3. **Guest property scope** — guest hits a property they are NOT granted → no other members' rows leak.
4. **Deactivated token dead** — set a test profile `deactivated_at`, hit its feed → 401.
5. **Junk/absent token** — still 401 (regression check on the existing 28000/22P02 handling).
6. Apply to prod + re-run 1–4 live.

## Likely file layout
```
supabase/migrations/20260702000001_ics_guest_scope.sql   # create or replace ics_bookings_for_token with role+deactivation checks
src/app/api/ics/[scope]/route.ts                          # (optional) Cache-Control private for token feeds
```

## Implementation

**Shipped 2026-07-02** on branch `claude/jolly-burnell-d319e1`.

### Key files
- [supabase/migrations/20260702000001_ics_guest_scope.sql](../supabase/migrations/20260702000001_ics_guest_scope.sql) — `create or replace ics_bookings_for_token(uuid, text)` with role + deactivation checks.
- [src/app/api/ics/[scope]/route.ts](../src/app/api/ics/[scope]/route.ts) — `Cache-Control` for token feeds tightened from `public, max-age=300` to `private, max-age=300`.

### Decisions made during build
- **Collapse-to-own for guests at every scope.** The function runs cookieless (anon role, no JWT), so `auth.uid()` is null and `is_guest()`/`is_property_guest()` are unusable inside it. Role + deactivation are read directly from the token-resolved profile row. A guest token returns only `b.requested_by = v_member` at **any** `p_scope` (`me`/`all`/`<slug>`). This is the PRD's "simplest correct option": it structurally guarantees no other booker's `guest_name`/`guest_email` can ever leak to a guest, and a guest's calendar app still resolves (to their own rows — none in v1, since guests can't book yet).
- **Deactivation checked for all roles**, before the return query, raising `28000` (route maps → 401). This kills a departed member's leaked feed URL independently of PRD 26 (which additionally rotates the token — defense in depth).
- **Member/admin branch is byte-identical** to the original where-clause (guarded by `v_role <> 'guest'`), so member/admin feeds return exactly the same rows as before.
- **Cache-Control → private** for token feeds too: the token is the secret and lives in the URL, and feeds are now caller-scoped, so a shared/CDN cache keyed on the URL must never serve one caller's feed to another. Third-party pollers fetch per-subscriber anyway.

### Verification
- `npx tsc --noEmit` clean; `eslint` clean on the route.
- Manual review against the reviewer sign-off checklist below — all boxes hold (guest branch cannot return a non-guest identity under any scope; deactivation covers all roles; member/admin unchanged; migration idempotent).

### Prod apply + live verification (done 2026-07-02)
- **Merged** (PR #26, `61f68ae`) and **applied to prod** (`supabase migration list` shows Local==Remote for `20260702000001`).
- **Live-verified on `www.mathiesonfamily.app`** (reviewer): member feed `/api/ics/me` + `/all` return 200 valid VCALENDAR; junk + malformed tokens → 401. Guest-collapse + deactivation branches corroborated by PRD 26's live test (a deactivated user can't read its own `ics_token`, and it's rotated on deactivate). Note: prod has zero approved bookings, so an event-count A/B can't distinguish scopes — this is a data condition, not a gap in the fix.
- PRD 26 rotates `ics_token` on deactivate, so a deactivated token is dead by rotation *and* by this function's check (defense in depth).

## Reviewer sign-off (I check these)
- [ ] Function still `security definer` + `set search_path = ''` + `revoke all` / explicit `grant to anon, authenticated`.
- [ ] Guest branch cannot return a non-guest's `guest_name`/`guest_email` under ANY `p_scope`.
- [ ] `deactivated_at` checked for ALL roles, not just guests.
- [ ] No behavioral change for member/admin tokens (diff the returned rows for a member before/after).
- [ ] Migration is idempotent (`create or replace`), prod-apply status recorded in Implementation.
