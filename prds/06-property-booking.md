# 06 — Property Booking & Calendar

**Phase**: 2 · **Depends on**: 03 (properties exist), 02 (members exist)
**Status**: ✅ shipped (2026-06-23) — landed on `main` via PR #2; migrations applied to prod and schema verified (self-approve trigger, exclusive `end_date` CHECK, `btree_gist` double-booking exclusion constraint all live). See [Implementation](#implementation) for what was built; the sections below are retained as design context.

> ⚠️ **Calendar integration is only half-done.** A one-way ICS feed shipped, but it is **cookie-authenticated**, so it works as a one-time download into a calendar app on the signed-in device — **not** as a live, auto-updating Google Calendar subscription (Google's servers fetch the feed with no login cookie and get a 401). There's also no "Add to Google Calendar" affordance and no subscribe link on the unified `/calendar`. The plan to finish it is in **[Google Calendar integration — status & plan](#google-calendar-integration--status--plan)** below. Status there: 🟢 ready (small follow-up slice).

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

- **Status**: 🟡 landing in progress. The reviewed work was cherry-picked clean off the tangled `feat/google-photos-picker` onto **`feat/booking-landing`** (off current `main`) as `de81af2` + `0117977`. Build + lint green (only the pre-existing `theme-toggle.tsx` lint error remains, on `main`). A new idempotent fix-migration `20260525150000_booking_fixes.sql` was authored to reconcile prod (see below). Remaining: PR → preview → merge → `supabase db push` → smoke test.

- **Migrations**:
  - `20260525000001_bookings.sql` — adds the `bookings` table + `properties.max_guests` / `properties.peak_period_ranges`. **Already applied to prod in its original (buggy) form** during the first booking session; `supabase db push` will skip it.
  - `20260525150000_booking_fixes.sql` — **idempotent reconciliation** that carries the security fixes (btree_gist, strict `end_date > start_date` CHECK, `bookings_no_overlap` GiST exclusion constraint, `enforce_booking_transitions` self-approve guard) as a NEW version so they actually reach prod. Safe on buggy, fixed, or partially-fixed DBs — every statement is catalog-guarded. RLS policies are identical between buggy/fixed and are intentionally untouched.

- **Key files**:
  - Migrations: [supabase/migrations/20260525000001_bookings.sql](../supabase/migrations/20260525000001_bookings.sql) + idempotent fix [supabase/migrations/20260525150000_booking_fixes.sql](../supabase/migrations/20260525150000_booking_fixes.sql)
  - Schema mirror: [src/lib/db/schema.ts](../src/lib/db/schema.ts) (bookings table, `BookingStatus`, `PeakPeriodRange`)
  - Server helpers: [src/lib/bookings.ts](../src/lib/bookings.ts) — `isInPeakPeriod`, `findOverlappingBookings`, `determineInitialStatus`, ISO date helpers
  - Server Actions: [src/app/(app)/properties/[slug]/calendar/actions.ts](../src/app/(app)/properties/[slug]/calendar/actions.ts) — `createBookingRequest`, `cancelBooking`, `approveBooking`, `declineBooking`
  - Per-property calendar: [src/app/(app)/properties/[slug]/calendar/page.tsx](../src/app/(app)/properties/[slug]/calendar/page.tsx) + `_components/` (MonthCalendar, BookingRequestForm, AdminBookingRow, OwnBookingCancel)
  - Unified calendar: [src/app/(app)/calendar/page.tsx](../src/app/(app)/calendar/page.tsx) (color-coded by property)
  - ICS feeds: [src/app/api/ics/[scope]/route.ts](../src/app/api/ics/[scope]/route.ts) — scope = property slug or `me`
  - Admin queue: [src/app/(app)/admin/page.tsx](../src/app/(app)/admin/page.tsx) (new "Pending bookings" briefing panel)
  - Edit-form additions: [src/app/(app)/properties/[slug]/edit/property-edit-form.tsx](../src/app/(app)/properties/[slug]/edit/property-edit-form.tsx) (`max_guests` + peak-period repeater UI) and the matching parse/diff in [actions.ts](../src/app/(app)/properties/[slug]/actions.ts)
  - Nav: [src/components/app-shell/site-nav.tsx](../src/components/app-shell/site-nav.tsx) (Operations group gains a "Calendar" link)
  - PRDs deferred from this slice: see Open follow-ups below

- **Review-driven fixes** (post-`de81af2`, before any prod apply):
  - **RLS self-approve loophole closed** — added a `BEFORE INSERT OR UPDATE` trigger (`enforce_booking_transitions`) that constrains non-admin writes: requesters can only INSERT with status `pending`, or `approved` if `approved_by = requested_by` (the auto-approve path); on UPDATE they can only set status to `pending`/`cancelled` and cannot touch `approved_by`/`approved_at`. The prior RLS `WITH CHECK` only verified ownership and would have allowed `PATCH /bookings/:id` from a member to flip their own pending booking to approved.
  - **Exclusive end_date semantics throughout** — `end_date` is now the EXCLUSIVE checkout day (matches RFC 5545 DTEND-exclusive and lets same-day turnover work). `CHECK end_date > start_date`. Conflict math (`findOverlappingBookings`) uses strict `<` / `>`. Peak-period iteration loops `[start, end)`. ICS export drops its `+1` offset. The form's drag-select stays inclusive (paints the nights you'll be there), and converts to exclusive on submit; the form shows "N nights — arrive Jun 14, depart Jun 21" so the conversion is visible.
  - **DB-level double-booking guard** — `EXCLUDE USING gist (property_id WITH =, daterange(start_date, end_date, '[)') WITH &&) WHERE (status = 'approved')` (with the `btree_gist` extension). Two admins racing to approve overlapping pendings can no longer both win; the loser gets a constraint violation that the action surfaces as "Another approved booking now conflicts — refresh the queue".
  - **Residual trust point**: INSERT auto-approve still relies on the Server Action to check peak periods. A member writing directly via PostgREST could insert `status='approved'` with their own `requested_by` outside peak windows but inside a configured peak window (bypassing peak gating). The exclusion constraint still prevents double-booking; only peak-period self-approve is bypassable. Acceptable in a closed family portal; revisit if we ever expand the surface area.

- **Decisions made during build**:
  - **Peak periods** live on the `properties` table as a `peak_period_ranges` JSONB column (recurring MM-DD pairs). Edited from the property edit page; admin-gated alongside status. Year-wrap is handled (Dec 22 → Jan 02 is one range, not two).
  - **Auto-approval** kicks in when no approved-overlap, no pending-overlap, and dates are outside every peak range. Otherwise the booking lands `pending`. Approved-overlap is a hard reject at action time (also re-checked at approval time as a race-safety net).
  - **Notifications** deferred — pending requests surface as a "Pending bookings" briefing panel on `/admin` (visible to site admins) and as an inline panel on each property's calendar page (visible to that property's admins). Resend never installed.
  - **Audit trail** extended: `RevisionEntity` now includes `"booking"`. Booking inserts, status transitions, and cancellations all record revisions. The diff helper handles arrays + scalars; JSONB peak ranges are stringified before passing to the diff to avoid noisy "object inequality" diffs.
  - **Custom calendar UI**: month grid in `month-calendar.tsx` (~250 lines with selection state and color-coded bands). No FullCalendar dependency. Re-used as-is by the unified `/calendar`.
  - **ICS auth model**: the route inherits the proxy's auth gate — feeds only refresh when the subscriber is signed in. No public-token URLs in this slice. Calendar subscriptions will work for cookie-bearing browsers (e.g. viewing the .ics file directly) but most native calendar apps will fail to refresh because they don't carry cookies. Tracked as a follow-up.
  - **Property creation + per-property admin grants**: confirmed both already exist (admin "Add a property" form and `PropertyAdminsEditor`). The booking system inherits both without new wiring — fresh properties default to `peak_period_ranges = []` and `max_guests = null` so they're immediately bookable.

- **Open follow-ups**:
  - **Real Google Calendar integration** — the shipped ICS feed is cookie-authed and doesn't auto-sync. See the scoped plan in [Google Calendar integration — status & plan](#google-calendar-integration--status--plan). _(Was previously listed here as "public-token ICS subscription URLs"; that's the core of the fix.)_
  - **Real email notifications** (Resend) — the in-app pending panel is fine for tight family use; add transactional emails when there are more than a handful of pending bookings or if family members aren't checking the portal frequently.
  - **Recurring bookings** ("the family always goes the week before Labor Day") — explicitly out of scope for this slice.
  - **Booking-cancellation visibility for the original requester** — currently they have to revisit the calendar to see the cancellation notes. Surfacing this in-app would benefit from the notifications work above.
  - **Property access scoping** — gated on the master-plan open decision. If we ever scope properties to family branches, the calendar visibility logic + ICS feed scope checks need to be revisited.
  - **Two-way Google Calendar sync** (Google → us, write-back) — still Phase 2.5+ and out of scope. Note this is distinct from the one-way *live subscription* below, which is the realistic near-term goal.

---

## Google Calendar integration — status & plan

**Status**: 🟢 ready — a small, well-scoped follow-up slice. Make the existing ICS feed actually auto-sync into Google Calendar (and Apple/Outlook), and give members a one-click way to add it.

### What shipped vs. what's missing

| | State |
|---|---|
| One-way ICS feed (`/api/ics/[scope]`, scopes: property slug, `me`, `all`) | ✅ built — generates valid RFC 5545 all-day events with exclusive `DTEND` |
| "Subscribe (ICS)" link | ⚠️ only on the **per-property** calendar; missing from the unified `/calendar` |
| Live auto-updating subscription | ❌ **broken** — feed is cookie-authenticated |
| "Add to Google Calendar" button / `webcal://` link | ❌ none |

### The core problem: the feed is cookie-authenticated

[src/app/api/ics/[scope]/route.ts](../src/app/api/ics/[scope]/route.ts) resolves the viewer via `supabase.auth.getUser()` (a session cookie) and returns `401` without one. When a user "subscribes by URL," **Google's servers** fetch the feed on a schedule with **no cookie** → 401 → the calendar silently stops updating (or never imports). So the current link only works as a **one-time download** in a browser that already has the session. Calling it "Subscribe" is misleading today.

### Plan to make it real

1. **Token-authenticate the feed instead of (or in addition to) the cookie.**
   - Give each member a rotatable secret token — e.g. `profiles.ics_token uuid` (default `gen_random_uuid()`), or a small `ics_tokens` table if we want multiple/named tokens with revocation.
   - Feed URLs carry it: `/api/ics/me?token=…`, `/api/ics/all?token=…`, `/api/ics/<slug>?token=…`.
   - In the route, if a `token` is present, resolve the member by token (service-role lookup) and skip the cookie check; otherwise fall back to the existing cookie path (so in-browser downloads still work).
2. **Let the route through the auth proxy.** `/api/ics/*` currently sits behind the global auth gate in [src/proxy.ts](../src/proxy.ts); add it to the allow-list so Google can reach it, since the **token** is now the authorization. (Don't expose any other API this way.)
3. **Treat the token as a bearer secret.** Anyone with the URL can read that scope's bookings (family-private, but no further login). Acceptable in a closed family portal, but: make tokens **rotatable** (a "reset my calendar link" button that invalidates the old URL), and never log full feed URLs.
4. **Add the affordances** on both the per-property calendar **and** the unified `/calendar`:
   - An **"Add to Google Calendar"** button → `https://calendar.google.com/calendar/r?cid=<url-encoded https feed URL>`.
   - A **`webcal://…`** link (opens Apple Calendar / Outlook subscribe dialogs).
   - A **copyable URL** + one-line "paste this into your calendar app → Subscribe" instructions for everyone else.
   - Offer the right scope per context: `me` (all my bookings everywhere) on the unified calendar; that property's feed on a property page.

### Reuse / touchpoints

- Extend [src/app/api/ics/[scope]/route.ts](../src/app/api/ics/[scope]/route.ts) (token branch); allow-list in [src/proxy.ts](../src/proxy.ts)
- Migration: add `ics_token` to `profiles` (or an `ics_tokens` table) + RLS; mirror in [src/lib/db/schema.ts](../src/lib/db/schema.ts)
- UI: a small `SubscribeToCalendar` component used by [/calendar](../src/app/(app)/calendar/page.tsx) and [per-property calendar](../src/app/(app)/properties/[slug]/calendar/page.tsx)

### Verification recipe

1. Reset/obtain your calendar link → copy the `me` feed URL with token.
2. Paste it into Google Calendar's "From URL", **signed out of the portal in that context** → an approved booking appears (proves the cookie isn't required).
3. Approve a new booking → it shows up in Google after the feed's refresh interval (Google polls ~every few hours; not instant — note this in the UI copy).
4. Click "Reset my calendar link" → the old URL now 401s; the new one works.
5. Hit `/api/ics/me` with **no token and no cookie** → `401` (no public leakage without the token).
