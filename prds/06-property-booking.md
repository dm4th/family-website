# 06 — Property Booking & Calendar

**Phase**: 2 · **Depends on**: 03 (properties exist), 02 (members exist)
**Status**: 🟡 built-but-not-landed — the feature is fully implemented on a branch and passed two review rounds, but landing it cleanly requires branch surgery + a prod-DB fix. Read the handoff below before doing anything.

---

## ⚠️ HANDOFF — how to land the existing booking work (read first)

The booking feature is **already built and reviewed** (two rounds, 2026-06: closed an RLS self-approve hole, switched to exclusive `end_date`, added a GiST double-booking exclusion constraint). It is **not on `main`**. Landing it has two traps:

### Trap 1 — the work is tangled with superseded photos commits
- Booking lives on branch **`feat/google-photos-picker`** as commits **`de81af2`** ("Property booking & calendar…") + **`0117977`** ("Bookings: close RLS self-approve, switch to exclusive end_date, add DB double-book guard").
- That same branch also carries an **older, divergent copy of the Google Photos Picker** (`feb8dbc`, `98ff49a`, `4141f7e`, `c78a0b5`) that was **superseded** by the version shipped to `main` in PR #1 (different commits). **Do not merge the whole branch** — it will collide with the shipped photos work.
- Branch **`feat/property-booking`** is empty/stale (no commits beyond `main`) — delete it.
- **Correct approach**: new branch off `main`, `git cherry-pick de81af2 0117977`, then resolve conflicts. A test cherry-pick conflicts in: `prds/00-master-plan.md`, `src/app/(app)/properties/[slug]/page.tsx`, and touches `src/lib/db/schema.ts`, `src/app/(app)/properties/[slug]/actions.ts`, the `edit/` pages, `src/components/app-shell/site-nav.tsx`, `src/lib/revisions.ts`. New (non-conflicting) files: everything under `src/app/(app)/properties/[slug]/calendar/`, `src/app/(app)/calendar/`, `src/app/api/ics/[scope]/route.ts`, `src/lib/bookings.ts`.

### Trap 2 — prod ALREADY has the bookings migration applied, possibly the BUGGY version
- `supabase migration list` shows version **`20260525000001`** (bookings) is **already applied to the prod DB** (it was pushed during the original booking session).
- But that migration file was **edited in place** by the fix commit `0117977`. Because the version is already recorded as applied, **`supabase db push` will SKIP it** — the security fixes (self-approve trigger, exclusive `end_date` CHECK, `btree_gist` exclusion constraint) will **never reach prod** via the existing file.
- **Before trusting prod**: verify what's actually live. Check whether the `enforce_booking_transitions` trigger and the `EXCLUDE USING gist (... daterange ...)` constraint exist on the prod `bookings` table. If they don't, prod has the vulnerable version.
- **Fix**: author a **new** migration (e.g. `20260525150000_booking_fixes.sql`) that **idempotently** asserts the fixed state — `drop trigger if exists` + recreate, `drop policy if exists` + recreate the requester UPDATE policy, `alter table … add constraint … if not exists` for the exclusion constraint, and reconcile the `end_date` CHECK. This brings prod to the correct state whether it currently has the buggy or fixed version. Do **not** rely on re-applying the in-place-edited `20260525000001`.

### Suggested landing sequence
1. Verify prod booking schema (Trap 2) — know what you're starting from.
2. New branch off `main`; cherry-pick `de81af2` + `0117977`; resolve the conflicts above (keep `main`'s shipped photos + the 05-shipped master-plan row).
3. Add the idempotent `booking_fixes` migration so prod converges to the correct, reviewed state.
4. `tsc` + `lint` (note: a pre-existing `theme-toggle.tsx` lint error is on `main`, unrelated). Re-run the booking review once more on the rebased result (the RLS is going to a live DB).
5. PR → green Vercel preview → merge → `supabase db push` → smoke-test request/approve/decline + same-day turnover + ICS feed on the live site.

**Review status**: the booking logic already passed review (RLS self-approve closed, `end_date` exclusive across conflict math / CHECK / exclusion constraint / ICS / calendar, double-book guard via `btree_gist`). Re-verify only the conflict-resolution + the new fix-migration.

---

## Onboarding (read first if you're picking this up cold)

1. **Read** [CLAUDE.md](../CLAUDE.md), [prds/00-master-plan.md](00-master-plan.md), then this file.
2. **You will reuse**:
   - `is_admin()` + `is_property_admin(uuid)` + `canManageProperty()` from [src/lib/property-auth.ts](../src/lib/property-auth.ts) for approve/decline gating
   - `recordRevision()` from [src/lib/revisions.ts](../src/lib/revisions.ts) if you want booking-edit history
   - The Server-Component + Server-Action + `revalidatePath()` pattern from `src/app/(app)/properties/[slug]/actions.ts`
   - shadcn/ui components in `src/components/ui/` (Button, Input, Card)
3. **Skills**: consult `.agents/skills/supabase` (for RLS patterns) and `.agents/skills/supabase-postgres-best-practices` (for index/perf patterns relevant to date-range queries).
4. **Migration workflow**: SQL files in `supabase/migrations/` are the source of truth — see [supabase/README.md](../supabase/README.md). Mirror in `src/lib/db/schema.ts`.

## Goal

Stop double-bookings at the family properties. Give members a visual calendar per property, a simple "request these dates" flow, and (later) sync to their personal calendars.

## User stories

- As a member planning a week at Loon-A-See, I open `/properties/loon-a-see/calendar`, see who has it booked, and request June 14–21 with a guest count.
- As a property admin during a busy week (4th of July), I see two requests for the same dates and approve one.
- As a Gmail user, my approved booking shows up on my Google Calendar (via ICS subscription).
- As any member, I see a unified calendar across all family properties.

## Pre-flight decisions (decide before writing code)

| Decision | Recommendation | Why |
|---|---|---|
| **Auto-approve vs. always-require-approval** | Auto-approve if no conflict; require approval for dates within configurable "peak periods" (holidays, July 1 – Aug 31) | Most weeks are unconflicted; manual approval is friction. Peak weeks deserve a trustee's eye. |
| **Approver scope** | Property admins for that property (or site admins). Not all members. | We already have `canManageProperty()` — reuse it. |
| **Booking unit** | Per individual, with a `guest_count` field for "I'm bringing N people" | Family unit boundaries are fuzzy (in-laws, cousins, etc.). Individual booker is responsible for their guests. |
| **Guest limits** | Add `max_guests` to `properties` (admin sets; nullable = no limit) | Loon Cabin sleeps 6; Loon House sleeps 14. Real constraint. |
| **Cancellation** | Member can cancel own pending or approved booking. Property admin can cancel anyone's with a `cancellation_notes` field. | Match the wiki-edit philosophy: open with audit trail. |
| **Conflict semantics** | Approved bookings block; pending bookings warn but don't block | Otherwise the first to click "request" effectively reserves. |

If any of these need a different answer for your family, capture the decision in this PRD's Implementation section when you ship.

## In scope (Phase 2)

- `bookings` table: `id`, `property_id`, `requested_by`, `start_date`, `end_date`, `guest_count`, `notes`, `status` (`pending` / `approved` / `declined` / `cancelled`), `approved_by`, `approved_at`, `cancellation_notes`, `created_at`, `updated_at`
- RLS: SELECT any authed; INSERT any authed (`requested_by = auth.uid()`); UPDATE own pending bookings OR `canManageProperty(property_id)`; DELETE only via soft cancel
- Per-property calendar view (month + agenda toggle)
- Unified all-properties calendar view at `/calendar` (color-coded by property)
- Booking request flow: pick dates → guest count + notes → submit; conflict warning surfaced inline
- Admin approval queue surface on `/admin` (third section after Members/Invitations/Properties? or its own page?)
- ICS export per property (read-only feed URL) and per user (their own bookings)
- Email notification on request / approval / decline (uses Supabase magic-link template for now, or Resend if added)

## Out of scope (for this PRD)

- Two-way Google Calendar sync (Phase 2.5; ICS one-way is enough for first cut)
- Apple / Outlook native integration
- Recurring bookings ("the family always goes the week before Labor Day")
- Waitlist for conflict resolution
- Travel-time blocking
- Payments / cost-sharing for bookings

## Likely file layout

```
supabase/migrations/
  YYYYMMDD000001_bookings.sql    # bookings table + indexes + RLS
src/lib/db/schema.ts             # mirror the bookings table
src/lib/bookings.ts              # query helpers (e.g., overlapsWithApproved())

src/app/(app)/properties/[slug]/calendar/
  page.tsx                       # month + agenda views
  booking-form.tsx               # request-a-date Client Component
  actions.ts                     # createBookingRequest, cancelBooking
src/app/(app)/properties/[slug]/calendar/admin/
  page.tsx                       # approve/decline queue (gated by canManageProperty)
  actions.ts                     # approveBooking, declineBooking
src/app/(app)/calendar/
  page.tsx                       # unified all-properties view
src/app/api/ics/
  [scope]/route.ts               # ICS feed (scope = property slug or "me")
```

(Adjust to taste — these are conventions matching what already exists, not commandments.)

## Verification recipe

End-to-end, on either local dev or prod:

1. Sign in. Open `/properties/loon-a-see/calendar` → empty calendar renders.
2. Request June 14–21, guest count = 4, notes "kids and Sarah". → booking row created with `status='pending'` (or `approved` if outside peak period).
3. Sign in as a different member. Request June 18–22 at the same property. → see a conflict warning; if you submit anyway, request stays `pending`.
4. Sign in as a property admin. Open the admin queue. → see both requests. Approve the first, decline the second. → emails fire (or get logged if email isn't wired).
5. Subscribe to the ICS feed in Google Calendar / Apple Calendar → approved booking appears within the feed's refresh interval.
6. Check `revisions` (if you wired it up) → cancellation/approval events recorded.

## References / reuse

- Calendar lib: **lean toward custom**. FullCalendar is ~200KB and overkill. A month grid + `date-fns` for date math is ~50 lines and gives you total control of styling. Agenda view is even simpler.
- Notification emails: if you don't want to add Resend, you can piggyback on Supabase's transactional emails by triggering a magic link to the recipient (per `sendInviteMagicLink` in `src/app/(app)/admin/actions.ts`). It's a hack but it works without new infrastructure.
- For date-range overlap RLS / queries: see `.agents/skills/supabase-postgres-best-practices/references/query-composite-indexes.md` — index on `(property_id, status, start_date, end_date)`.
- For ICS generation: the `ics` npm package is small and battle-tested.

## Implementation

_To be filled in by the contributor who ships this. Follow the format used in [03-properties.md](03-properties.md) Implementation section._

- **Status**: not started
- **Key files**: (list once shipped)
- **Decisions made during build**: (any deviations from the recommendations above)
- **Open follow-ups**: (what's deferred)
