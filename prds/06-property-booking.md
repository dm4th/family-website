# 06 — Property Booking & Calendar

**Phase**: 2 · **Depends on**: 03 (properties exist), 02 (members exist)

## Goal

Stop double-bookings at the family properties. Give members a visual calendar per property, a simple "request these dates" flow, and optional sync to their personal calendars.

## User stories

- As a member planning a week at Loon Lake, I open `/properties/loon-lake/calendar`, see who has it booked, and request June 14–21 with a guest count.
- As an admin during a busy week (4th of July), I see two requests for the same dates and approve one.
- As a Gmail user, my approved booking shows up on my Google Calendar automatically.
- As any member, I see a unified calendar across all family properties.

## In scope

- `bookings` table: `property_id`, `requested_by`, `start_date`, `end_date`, `guest_count`, `status` (`pending`, `approved`, `declined`, `cancelled`), `notes`, `approved_by`, `approved_at`
- Calendar view per property (month + agenda) — use FullCalendar or a lighter custom impl
- Booking request flow with conflict detection (overlapping approved bookings)
- Admin approval flow (for properties / periods that require it — start with: holidays auto-require approval, otherwise auto-approve if no conflict)
- ICS export per property and per user (one-way; family members add the URL to their calendar app)
- Email notification on request, approval, decline

## Out of scope (for Phase 2)

- Two-way Google Calendar sync (Phase 2.5 if requested)
- Apple / Outlook native integration
- Recurring bookings
- Waitlist
- Travel-time blocking
- Payments / cost-sharing for bookings

## Open questions

- Auto-approve threshold: which dates require admin approval? Recommendation: dates within configurable "peak periods" (holidays, July 1–Aug 31). Otherwise auto-approve if no conflict.
- What's the cancellation policy in-app? Recommendation: member can cancel their own pending or approved booking; admin can cancel anyone's with a notes field.
- Guest count limits per property — add `max_guests` to `properties`?
- One booking per family unit, or per individual? Recommendation: per individual, with a "bringing X guests" field; the booker is responsible for their guests.

## References / reuse

- Calendar lib: TBD — FullCalendar is heavy; might custom-build with a month grid + date-fns for first cut
- Notification emails: same Resend setup as `04-admin-invitations.md`
