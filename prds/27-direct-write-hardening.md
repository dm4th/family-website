# 27 — Direct-Write Hardening (Property Columns + Peak Approval)

**Phase**: 6 (security hardening) · **Depends on**: 03 (properties + `canManageProperty`), 06 (bookings + `enforce_booking_transitions`)
**Status**: 🚧 in progress (claimed 2026-07-02, branch `claude/stoic-torvalds-03624b`) — **SECURITY, MEDIUM.** Its own session/branch.
**Parallel-safe with**: 25, 26, 28, 29, 30, 31 (migration-only; no shared app files).

---

## Why this exists (the gap)

Two admin-only rules live **only in Server Actions** and are bypassable by any non-guest member calling PostgREST directly. The site's own posture ([CLAUDE.md], [PRD 15]) is "RLS is the guarantee, the app is a UX layer" — these two spots violate it.

**1. Properties table has no column guard.** The wiki-update policy is column-blind:
```sql
create policy "properties: authenticated wiki update" on public.properties
  for update to authenticated
  using (not public.is_guest()) with check (not public.is_guest());
```
([20260629000002_guest_access.sql:233](../supabase/migrations/20260629000002_guest_access.sql)). The app gates `status` / `max_guests` / `peak_period_ranges` / `hero_image_path` behind `canManageProperty()` in [properties/[slug]/actions.ts](../src/app/(app)/properties/[slug]/actions.ts) — but a member can `update properties set status=…, peak_period_ranges='[]'` via the API and skip that gate entirely. `profiles` already has exactly the guard that's missing here (`guard_profile_privileged_columns`, [20260523000002_rls.sql:219](../supabase/migrations/20260523000002_rls.sql)).

**2. Peak-approval is server-action-only.** `enforce_booking_transitions` accepts a non-admin INSERT with `status='approved'` as long as `approved_by = requested_by` ([20260525150000_booking_fixes.sql:133](../supabase/migrations/20260525150000_booking_fixes.sql)). The "peak windows require admin approval" rule lives only in `determineInitialStatus` in the server action. So a member can INSERT an approved booking during a peak window directly. Double-booking is still prevented (GiST exclusion), but the peak control is bypassable — and **clearing `peak_period_ranges` via gap #1 removes peak windows for everyone**, compounding it.

Neither is catastrophic on a trusting family site today. Both matter as booking fairness and trust/finance stakes rise, and both are cheap to close at the DB.

## Goal

The admin-only property fields and the peak-approval requirement are enforced by the database, so the Server Action gate can't be bypassed via PostgREST.

## Pre-flight decisions

| Decision | Recommendation | Why |
|---|---|---|
| **Property columns** | A `guard_property_privileged_columns()` BEFORE UPDATE trigger mirroring the profiles guard: block changes to `status`, `max_guests`, `peak_period_ranges`, `hero_image_path` unless the caller passes `canManageProperty` (i.e. `is_admin()` OR `is_property_admin(id)`). Ordinary wiki fields (description, guidelines, how_to, amenities, contacts) stay open to any non-guest. | Reuses the proven profiles pattern; keeps wiki-openness while locking privileged fields. |
| **Peak approval** | Move the peak-window evaluation into `enforce_booking_transitions` (or a helper it calls): a non-admin INSERT with `status='approved'` is only allowed when the requested dates fall **outside** every `peak_period_ranges` entry for that property; peak-window requests are forced to `pending`. | Puts the control where it can't be bypassed. The server action can keep its own check for UX (fast feedback), but the DB is now authoritative. |
| **Alternative (simpler)** | If encoding peak logic in PL/pgSQL is too fiddly, forbid non-admin `status='approved'` INSERT entirely and have the auto-approve happen via a trusted path. | Only if the peak-in-trigger version proves messy; note the tradeoff (server round-trip for auto-approve). |

## In scope
- **Migration**: `guard_property_privileged_columns()` + BEFORE UPDATE trigger on `properties`.
- **Migration**: peak-window check inside `enforce_booking_transitions` (or forbid non-admin approved-insert).
- Confirm the Server Actions still work unchanged (they should — they already only touch these fields as admins).

## Out of scope
- Any new property fields or booking features.
- The self-approve `approved_by = requested_by` path itself for **non-peak** dates (that's the intended auto-approve and stays).

## Verification recipe
1. **Admin still edits** — a site/property admin changes status + peak ranges via the UI → works.
2. **Member blocked (columns)** — as a non-admin member, direct PostgREST `update properties set status='inactive'` → **denied** by the trigger. Wiki fields (description) still update.
3. **Member blocked (peak)** — non-admin direct INSERT of an `approved` booking on peak dates → forced pending / rejected; off-peak auto-approve still works.
4. **Double-booking guard intact** — overlapping approved insert still rejected by the GiST constraint.
5. Apply to prod + re-run 2–3 live with a test member token.

## Likely file layout
```
supabase/migrations/20260702000003_property_column_guard.sql   # guard_property_privileged_columns + trigger
supabase/migrations/20260702000004_peak_approval_in_trigger.sql # peak check inside enforce_booking_transitions
```

## Reviewer sign-off (I check these)
- [ ] Guard blocks ALL of status/max_guests/peak_period_ranges/hero_image_path for non-`canManageProperty` callers, proven via direct PostgREST.
- [ ] Property admins (not just site admins) still pass — the guard uses `canManageProperty` semantics, not just `is_admin()`.
- [ ] Wiki fields remain editable by any non-guest member (no over-blocking).
- [ ] Peak-window bypass closed at the DB; off-peak auto-approve unaffected.
- [ ] Triggers are `security definer`, `search_path=''`.
- [ ] Prod-apply status recorded.

---

## Implementation (shipped 2026-07-02, PR pending review)

**Migrations added** (migrations-only PR, no TS changes):

1. [`20260702000003_property_column_guard.sql`](../supabase/migrations/20260702000003_property_column_guard.sql) — `guard_property_privileged_columns()` BEFORE UPDATE trigger on `properties`. Mirrors the existing `guard_profile_privileged_columns` pattern: raises `42501` if a caller who is **not** `is_admin() OR is_property_admin(old.id)` tries to change `status`, `max_guests`, `peak_period_ranges`, or `hero_image_path`. Uses `is distinct from` so same-value writes (the server action always sends all fields) pass. `security definer`, `search_path=''`. RLS policy untouched — wiki fields stay open to any non-guest member.

2. [`20260702000004_peak_approval_in_trigger.sql`](../supabase/migrations/20260702000004_peak_approval_in_trigger.sql) — new `booking_touches_peak(property_id, start, end)` SQL helper that mirrors `isInPeakPeriod()` in [`src/lib/bookings.ts`](../src/lib/bookings.ts) exactly (recurring annual `MM-DD` windows, inclusive both ends, year-boundary wrap when `end < start`, half-open `[start, end)` stay nights so the checkout day is not a stay night, malformed entries skipped via the same regex bounds as `parseMonthDay`). `enforce_booking_transitions` re-created with one added rule on the non-admin INSERT path: `status='approved'` is rejected when any stay night touches a peak window. Rest is byte-identical to the `20260525150000` version; trigger binding unchanged.

**Key decisions:**
- Went with the **peak-check-in-trigger** approach (pre-flight recommendation A), not the simpler "forbid all non-admin approved inserts" fallback — off-peak auto-approve stays a single round-trip, matching current UX.
- No UPDATE-path peak check needed: a non-admin can never set `status='approved'` via UPDATE (existing rule), so approved bookings' dates can't be edited around the check.
- Server Action `determineInitialStatus()` kept for fast UX feedback; the DB is now the authority.

**Verification:** built a 15-case local-Supabase suite (member / property-admin / site-admin PostgREST simulations via `set_config` JWT claims) covering all four privileged columns, wiki-field openness, off-peak vs on-peak self-approve, wrap-around windows, half-open checkout-day boundary, and the GiST double-booking guard. _Local run was set up but the run itself was skipped at Dan's request to ship the PR; suite is committed for the reviewer / prod re-run._

**Open follow-up:**
- [ ] **Prod apply** — `supabase db push` after merge, then re-run the member-token negative cases (columns + peak) live per Verification recipe step 5. Update this section + the master-plan row with the prod-apply date.
