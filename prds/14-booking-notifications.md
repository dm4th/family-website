# 14 — Booking Notifications

**Phase**: 2 (booking polish) · **Depends on**: 06 (booking + calendar shipped)
**Status**: ✅ shipped — transactional **email** (Resend) on all four booking events, best-effort and gated on `RESEND_API_KEY` (no key → log-and-skip, booking still succeeds). Shipped via PR #6. The design context below is retained; see [Implementation](#implementation) for what was actually built and where it deviates from the plan.

> Forces the long-deferred email decision. PRD 06 shipped bookings with **in-app panels only** ("Notifications deferred — Resend never installed"); the master plan's Email row reads "Resend deferred (no current need)." The testing playbook (Session C) surfaced the need: _"send an email to me and to whomever is listed as the admin of a property when a place is booked (auto-approve) and a more urgent email when a place needs approval."_ This PRD wires the first real transactional-email provider and hangs booking notifications off it.

---

## Onboarding (read first if you're picking this up cold)

1. **Read** [CLAUDE.md](../CLAUDE.md), [AGENTS.md](../AGENTS.md), [00-master-plan.md](00-master-plan.md), then [06 — Property Booking & Calendar](06-property-booking.md) (especially its **Implementation** + "Open follow-ups: Real email notifications (Resend)"), then this file.
2. **This is the booking feature's missing notification layer.** The four booking Server Actions already exist and are the only call sites you touch:
   [src/app/(app)/properties/[slug]/calendar/actions.ts](../src/app/(app)/properties/[slug]/calendar/actions.ts) — `createBookingRequest`, `cancelBooking`, `approveBooking`, `declineBooking` (the last two both funnel through the private `setBookingDecision`).
3. **Auto-approve vs. pending is already decided** for you by `determineInitialStatus` in [src/lib/bookings.ts](../src/lib/bookings.ts). `createBookingRequest` returns `{ status: "saved", bookingStatus: "approved" | "pending" }` — that field is your branch point for which email to send.
4. **Recipient authorization helpers already exist**: `is_admin()` / `is_property_admin(uuid)` SQL fns, the `property_admins` join table, and `canManageProperty()` in [src/lib/property-auth.ts](../src/lib/property-auth.ts). Recipient **email addresses** live in `profiles.email`. See [Pre-flight decisions](#pre-flight-decisions-decide-before-writing-code) for the read-path wrinkle (no service-role key).
5. **There is no email provider wired today.** Magic links ride Supabase's built-in auth email ([sendInviteMagicLink](../src/app/(app)/admin/actions.ts)); no transactional provider exists. **You are adding the first one.** Do **not** piggyback on Supabase magic-link emails for this (see [Out of scope](#out-of-scope-for-this-prd)).

## Goal

When something happens to a booking, the right people get an email — automatically, reliably, and without the booking flow ever breaking because an email failed. Specifically:

- **Auto-approved booking** → a calm confirmation/notification to the **booker**, the **property admin(s)**, and the **site admin (Dan)**: "Loon House is booked Jun 14–21 for Sarah (4 guests)."
- **Booking needs approval** (landed `pending`) → a **more urgent** prompt to the **property admin(s)** + **site admin**: "Action needed — a request for the Fourth of July week is waiting for your approval," with a link straight to the admin queue.
- **Approve / decline** → notify the **booker** of the outcome (with the admin's cancellation/decline note if present).

No one should have to remember to check the in-app panel. The in-app panel stays as the at-a-glance view; email is the push.

## In scope

- A real transactional-email provider (**Resend** — see decisions) with env-var config, domain verification for `mathiesonfamily.app`, and a typed, best-effort send helper at `src/lib/email.ts`.
- A small set of booking email templates (HTML, mode-aware copy): **auto-approved confirmation**, **approval-needed (urgent)**, **approved**, **declined**, and **cancelled-by-admin** (reuses the decline shape — the requester needs the note).
- A `src/lib/booking-emails.ts` orchestration layer that, given a booking + event type, resolves the recipient set (booker / property admins / site admin), de-dupes, and fires the right template via `src/lib/email.ts`.
- Hooking those sends into the four existing actions **after the successful DB write**, best-effort: an email failure must **never** roll back the booking, block the response, or surface as a booking error. Wrap in `try/catch`, log, move on.
- A server-side way to read recipient emails (property admins + site admin + booker) given a `property_id` — see the read-path decision below.
- Deep links in every email: property calendar page and/or the admin queue, built from the same site-origin helper the ICS feed uses ([getSiteOrigin()](../src/lib/ics.ts)).

## Pre-flight decisions (decide before writing code)

| Decision | Recommendation | Why |
|---|---|---|
| **Provider** | **Resend.** Add `RESEND_API_KEY` + a `BOOKING_EMAIL_FROM` (e.g. `bookings@mathiesonfamily.app`). Verify the `mathiesonfamily.app` domain (SPF/DKIM) in Resend so mail doesn't land in spam. | Simple API, generous free tier, first-class React/HTML email, no SMTP plumbing. Already named as the intended provider in PRD 06's follow-ups + master-plan Email row. |
| **Template approach** | Plain typed **HTML string builders** (one function per template, shared header/footer) for v1. Consider `@react-email/components` later if templates grow. | Zero render-pipeline risk on Next 16 / React 19 / Turbopack (per [AGENTS.md](../AGENTS.md)); 5 small templates don't justify a dep. Keep copy editorial, not "marketing-hype" (per CLAUDE.md tone rules). |
| **Recipient read path** (the real wrinkle) | The project configures **no service-role / secret key** (only the publishable key — see [src/lib/supabase/env.ts](../src/lib/supabase/env.ts)). Mirror the ICS pattern: a **`SECURITY DEFINER` SQL function** `booking_notification_recipients(p_booking_id uuid)` that returns the booker, every property admin, and every site admin (email + display name + role), callable by the booking actions' authed session. | Avoids introducing a new secret. Same trusted-surface pattern PRD 06 used for `ics_bookings_for_token()`. RLS on `profiles.email` would otherwise make a plain client read of *other* members' emails awkward; a definer fn returns exactly the recipient set and nothing else. |
| **Recipients per event** | See the matrix below. | The family's explicit ask: booker + property admin(s) + Dan on auto-approve; the admins (urgent) on pending; the booker on the outcome. |
| **Sync vs. queued sending** | **Synchronous, best-effort, after the DB write**, inside the existing Server Action. No queue/cron/webhook in v1. | Volume is a handful of bookings a week — a queue is over-engineering. Resend's call is fast; wrap it so a slow/failed send can't block or fail the booking. Revisit (queue + retry) only if volume or deliverability demands it. |
| **Opt-out / preferences** | **None in v1** — every member implicitly receives booking mail relevant to them. Add a footer line ("You're receiving this because you booked / administer this property") and note a future `profiles.notify_*` toggle. | A closed family portal with low volume; per-member preference UI is scope creep. Flag as a follow-up. |
| **Links to include** | Auto-approved & approved/declined emails → the **property calendar page** (`/properties/<slug>/calendar`) so the booker can see/manage their booking. Approval-needed email → the **admin queue** (the in-app pending surface — `/admin` and the per-property calendar admin panel). Build URLs from [getSiteOrigin()](../src/lib/ics.ts); set `NEXT_PUBLIC_SITE_URL` in prod (the fallback host header is spoofable). | The link is the call-to-action; the urgent email is useless without a one-click path to approve. |
| **From / reply-to** | `from`: `Mathieson Family <bookings@mathiesonfamily.app>`; `reply-to`: Dan's address so replies reach a human. | Friendly sender, real reply target. |

**Recipient matrix** (de-dupe by email — the booker may also be a property admin or the site admin; send them one email, preferring the most relevant template):

| Event | Booker | Property admin(s) | Site admin (Dan) | Template | Tone |
|---|---|---|---|---|---|
| Booking **auto-approved** (`createBookingRequest` → `bookingStatus: "approved"`) | ✅ confirmation | ✅ FYI | ✅ FYI | `auto-approved` | calm |
| Booking **needs approval** (`createBookingRequest` → `bookingStatus: "pending"`) | ✅ "request received, pending" (optional but kind) | ✅ **action needed** | ✅ **action needed** | `approval-needed` | **urgent** |
| Booking **approved** (`approveBooking`) | ✅ "you're confirmed" | — | — | `approved` | warm |
| Booking **declined** (`declineBooking`) | ✅ outcome + reason | — | — | `declined` | considerate |
| Booking **cancelled by admin** (`cancelBooking`, admin cancelling someone else's) | ✅ outcome + `cancellation_notes` | — | — | `declined`-shaped | considerate |

> Member cancelling **their own** booking → no email needed in v1 (they did it themselves). Admin cancelling **another member's** booking → notify that booker (the `cancellation_notes` reason is already required by the action).

## Out of scope (for this PRD)

- **Digests / batching** ("here's this week's bookings") — per-event only for now.
- **SMS / push notifications** — email only.
- **An in-app notification center** — the in-app **pending-bookings panel already exists** (`/admin` briefing panel + per-property calendar admin panel from PRD 06). This PRD adds the *push*, not a new in-app surface.
- **Per-member notification preferences UI** (`profiles.notify_*` toggles) — flagged as a follow-up.
- **Piggybacking Supabase magic-link emails** to deliver notifications (the hack floated in PRD 06's references). It's wrong for this: it forces an auth side-effect, can't carry booking-specific copy, and only addresses one recipient at a time. Use a real provider.
- **Reminders** ("your stay starts tomorrow") and **calendar-change** notifications — future.
- **Two-way reply handling / threading** — replies just go to Dan's inbox.

## Likely file layout

```
src/lib/email.ts                 # typed Resend send helper: sendEmail({to, subject, html, replyTo?})
                                 #   best-effort wrapper sendEmailSafe() that try/catches + logs, never throws
src/lib/email-templates/
  booking-auto-approved.ts       # HTML builder + subject
  booking-approval-needed.ts     # urgent variant
  booking-approved.ts
  booking-declined.ts            # also used for admin-cancellation
  _layout.ts                     # shared header/footer/styles (editorial, family-office tone)
src/lib/booking-emails.ts        # orchestration: resolve recipients (via RPC), de-dupe, pick template, fan-out

supabase/migrations/
  YYYYMMDD000001_booking_notification_recipients.sql
                                 # SECURITY DEFINER fn booking_notification_recipients(p_booking_id uuid)
                                 #   → returns {email, display_name, role: 'booker'|'property_admin'|'site_admin'}

# call-site hooks (edits, not new files)
src/app/(app)/properties/[slug]/calendar/actions.ts
                                 # after each successful write: await notifyBooking…(…) wrapped best-effort
```

(Adjust to taste — these match existing conventions, not commandments. `src/lib/email.ts` is the path the family asked for by name.)

### Hook points (precise)

- **`createBookingRequest`** — after the `recordRevision` + `revalidatePath` block (booking row committed), branch on `initialStatus`: `"approved"` → `auto-approved`; `"pending"` → `approval-needed`.
- **`setBookingDecision`** (drives both `approveBooking` / `declineBooking`) — after the successful `update` + revision, branch on `decision`: `"approved"` → `approved` to booker; `"declined"` → `declined` to booker.
- **`cancelBooking`** — after the successful update, **only when** `!isOwner && canAdmin` (admin cancelled someone else's): send the `declined`-shaped email to `booking.requested_by` with `cancellation_notes`.

Each call is `try { await sendEmailSafe(...) } catch { /* logged inside */ }` — or, since `sendEmailSafe` already swallows, just `await notify…().catch(logEmailError)`. The booking response is returned **regardless**.

## Verification recipe

Local dev or prod (set `RESEND_API_KEY` + `BOOKING_EMAIL_FROM` + `NEXT_PUBLIC_SITE_URL`; in dev you can point `BOOKING_EMAIL_FROM` at Resend's sandbox / send to your own verified address):

1. **Auto-approve path** — as a member, request dates **outside** any peak period with no conflict → booking is `approved` instantly. Confirm three emails fire (booker, property admin, Dan), de-duped if you're more than one of them. Links open the property calendar.
2. **Approval-needed path** — request dates **inside** a peak period (or overlapping a pending) → booking lands `pending`. Confirm the **urgent** email reaches the property admin(s) + Dan and the CTA link lands on the admin queue. (Optional booker "received, pending" email if you implemented it.)
3. **Approve** — as a property admin, approve the pending request → booker gets the "confirmed" email.
4. **Decline** — decline another pending request → booker gets the outcome email.
5. **Admin cancellation** — as an admin, cancel a *different member's* approved booking with a note → that booker gets the note by email; member-cancels-own sends nothing.
6. **Failure isolation** — temporarily set a bogus `RESEND_API_KEY` → bookings still succeed (row written, in-app panel updates, action returns `saved`); the email error is only logged. **This is the most important check** — email must be strictly best-effort.
7. **Recipient correctness** — verify the `SECURITY DEFINER` RPC returns exactly booker + that property's admins + site admin(s), and that a member with no admin role never receives an admin-only email.
8. **Deliverability** — confirm the `mathiesonfamily.app` domain is verified in Resend (SPF/DKIM pass) and a test send doesn't land in spam.

## Implementation

Shipped via PR #6. The recipient *intent* matches the plan; the build deviates from the suggested file layout and the recipient read-path (both flagged below and accepted in review).

- **Dependency**: added `resend` (`^6.x`).

- **Email layer** ([src/lib/email/resend.ts](../src/lib/email/resend.ts)): `sendEmail({ to, subject, html, text, replyTo? })` — lazily memoizes a `Resend` client; returns a discriminated `SendEmailResult` (`ok` / `skipped` (no key or no recipients) / `error`). **Never throws.** `from` comes from `RESEND_FROM_EMAIL`, falling back to Resend's `onboarding@resend.dev` sandbox sender so first-run testing works before the domain is verified.

- **Email shell** ([src/lib/email/layout.ts](../src/lib/email/layout.ts)): one restrained, table-based, inline-styled HTML shell (ivory/ink, single forest CTA — Operations mode) + a matching plaintext renderer. `escapeHtml()` on every interpolated value. Reusable by future emails (invitations).

- **Templates** ([src/lib/email/booking-emails.ts](../src/lib/email/booking-emails.ts)): five pure builders returning `{ subject, html, text }` — `bookingRequestedEmail` (urgent, to admins on pending), `bookingAutoApprovedAdminEmail` (**calm FYI, to admins on auto-approve**), `bookingApprovedEmail` (booker; `autoApproved` flag tweaks the lead), `bookingDeclinedEmail`, `bookingCancelledEmail`. `formatStayRange()` renders the half-open `[start, end)` range honoring PRD 06's **exclusive** `end_date`.

- **Orchestration** ([src/lib/notifications/bookings.ts](../src/lib/notifications/bookings.ts)): `notifyBookingRequested` / `notifyBookingAutoApprovedAdmins` / `notifyBookingApproved` / `notifyBookingDeclined` / `notifyBookingCancelled`. Each takes the request-scoped supabase client + booking facts, self-fetches property + requester, resolves recipients, sends. Every one is try/catch-wrapped and logs on failure — **best-effort by construction**. Admin recipients = `profiles WHERE role='admin'` ∪ `property_admins(profile_id→profiles.email)`, deduped case-insensitively, requester removed (so an admin booking their own dates doesn't email themselves; site admin Dan is included via the `role='admin'` arm).

- **Call sites** ([…/calendar/actions.ts](../src/app/(app)/properties/[slug]/calendar/actions.ts)): fired after `recordRevision()` / before `revalidatePath()`. `createBookingRequest` branches on `initialStatus`: **`approved` → booker confirmation _and_ a calm admin FYI**; `pending` → urgent admin alert. `setBookingDecision` → booker on approve/decline. `cancelBooking` → booker only when `!isOwner && canAdmin`.

### Deviations from the plan (accepted in review)

- **Recipient read path — session reads, not a `SECURITY DEFINER` fn.** The plan recommended a `booking_notification_recipients()` definer function. We instead read recipients under the acting user's session, which works because `profiles` and `property_admins` are both `authenticated read all` — so **no migration and no new secret**. The dependency on that RLS posture (and the definer fn as the escape hatch if it's ever tightened, e.g. by PRD 15) is documented in a header comment in `notifications/bookings.ts`. Reviewer accepted this for now.
- **File layout** differs from the plan's suggested `src/lib/email.ts` / `src/lib/email-templates/` / `src/lib/booking-emails.ts` — built as `src/lib/email/{resend,layout,booking-emails}.ts` + `src/lib/notifications/bookings.ts`. Functionally equivalent; the plan explicitly allowed adjusting to taste.
- **Env var naming**: used `RESEND_FROM_EMAIL` (already reserved in `.env.local.example`) rather than the plan's `BOOKING_EMAIL_FROM`.
- **Reply-To**: admin-facing emails set `reply-to` = the booker (so an admin can reply straight to them); booker-facing emails set none. The plan suggested reply-to = Dan's address; revisit if a single human reply target is wanted (would need a `BOOKING_REPLY_TO` env).
- **Booker "received, pending" email**: the plan marked this **optional**; not implemented. On the pending path only the admins are emailed. Easy to add later.

- **Verification**: `npm run lint` clean; `npx tsc --noEmit` clean; full `next build` compiles + generates all routes. Email-delivery steps (1–8) require `RESEND_API_KEY` + a verified `mathiesonfamily.app` domain in prod — **not yet provisioned** (the gated layer no-ops until then).

- **Open follow-ups**:
  - **Provision Resend in prod** — set `RESEND_API_KEY` + `RESEND_FROM_EMAIL`, verify the `mathiesonfamily.app` domain (SPF/DKIM). Until then only the Resend account owner receives mail.
  - **Pre-trip reminders** ("your stay starts in N days") — needs a Vercel cron + a `notifications_sent` dedup log. Out of scope here; the natural next slice.
  - **Member-cancels-own → admin FYI** — currently emails no one (admins see it in-app). Could notify admins a slot freed.
  - **Per-member notification preferences** (`profiles.notify_*`) — none today; add if volume grows.
  - **`SECURITY DEFINER booking_notification_recipients()`** — the planned read path; adopt if member profile/email visibility is ever restricted.
