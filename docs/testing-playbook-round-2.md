# Testing Playbook — Round 2 (post-onboarding / guest / polish / image-perf)

Round 1 ([testing-playbook.md](testing-playbook.md)) tested the base portal and produced a gap log. Since then, five slices shipped that directly answer that feedback. This round focuses on **what's new** and **re-testing the gaps you logged** — not re-walking everything.

> **Fresh slate:** the database was wiped of test data — only **Daniel** and **Peter** remain, no test bookings, no guests. So the onboarding flow can be tested as a genuine first-run, and you're not tripping over old test rows.

> **Known gaps — still don't log these (not built yet):**
> - **Legacy** (people directory / family tree / photo archive / timeline / stories) — the `people` table exists but there's no UI yet (PRD 11, next big build).
> - **Booking emails only send if Resend is configured** — they need `RESEND_API_KEY` + `RESEND_FROM_EMAIL` + a verified domain. Without those, bookings still work; the email just logs-and-skips. (Check whether you've set these before testing Session C's email step.)
> - No comments/messaging, no global "all photos" gallery, no search.
> - Calendar feeds refresh on the calendar app's schedule (hours), not live.

## What's new since round 1 (and which gap it answers)
| New | Round-1 gap it addresses |
|---|---|
| Guided **`/welcome` onboarding** + Family Branch dropdown + inline profile photo | "Unnamed" landing; "get people to create a profile"; "/family shows initials" |
| **Guest access** (property-scoped logins) | Session D: "what permissions do guests have?" |
| **Booking emails** (Resend) | Session C: "email me + the property admin when a place is booked" |
| **Title Case + em-dash scrub + Home nav + calendar labels/legend** | Gap log: Proper Case, em-dashes, back-to-home, calendar event names |
| **Image downscaling** (2048px + 400px thumb) | Gap log: 9.2MB JPEG "very, very slow" |

## Setup
You'll want up to three identities, all drivable from one machine via incognito windows:
- **Dan** — admin (you).
- **A fresh member** — invite a second email you control, to test onboarding as a true first-run.
- **A guest** — invite a third email (a `+alias` of yours works; the magic link lands in your inbox), granted one property.

Test on **laptop and a phone/iPad** — the onboarding flow especially is for the eldest generation.

---

## Session A — New-member onboarding (the headline new flow)
- [✅] As Dan, `/admin` → invite a **member** (fresh email). Send the magic link.
- [⚠️] Open the link in an incognito window → confirm you land in the **guided `/welcome` flow**, NOT a cold dashboard, and **never see "Unnamed"**.
    - Missed setting a "Generation" on user setup. Defaults to "Not Set"
    - Include fields for phone number and relationship notes as well
- [✅] Step through it: type a name → pick a **Family Branch from the dropdown** (Peter's / Andy's / Peggy's) → add a photo → optional bio → finish.
- [✅] Land on the dashboard with a brief **welcome panel**; open **`/help`** from the user menu.
- [✅] Back as Dan: open **Directory** → the new member now shows a **face, name, and branch** (not initials).
- [✅] Try **"Finish later"** with a different fresh invite → confirm you're let into the app with a soft nudge (not trapped), and not bounced back to `/welcome` on every load.
- 🔎 Does the flow feel warm and obvious on an iPad? Is the branch dropdown's wording right? Did the photo upload feel easy (inline, no separate page)?
    - iPad setup was even better than desktop well done!!


## Session B — Guest access
- [✅] As Dan, on a **property page** (or `/admin` invite), use **"Add a guest"** / invite with role **guest** → it should **require choosing a property**.
- [⚠️] Sign in as the guest (incognito, via their magic link) → confirm they **land directly on that one property** (not a dashboard).
    - Got a `email rate limit exceeded` error from Supabase. Is this somethign we can do via Resend?
- [ ] Guest view: **no Directory/Calendar/Admin nav**, **no Edit** button, can see the property's **contacts/photos** and a **busy/free calendar** (no other people's names).
- [ ] As the guest, type `/family`, `/admin`, `/calendar` in the URL bar → each should **bounce you to your property**, never show the page.
- [ ] Grant the guest a **second** property → reload `/properties` → now shows **just those two**, pick one.
- [ ] Back as Dan: **revoke** a grant from the property's guest panel → guest loses that property.
- 🔎 Is "Add a guest" easy to find for a family member (not just admin)? Does the busy/free calendar make sense to a renter?
    - Could not test the experience from a guest's POV because of email rate limits

## Session C — Booking + notifications
- [✅] As a member, request dates **outside** a peak period → auto-approves. As a member, request dates **inside** a peak period → lands pending.
    - Quick Note: When I click a date on the calendar, it automatically sets that date to both the "Arrive" and the "Last Night" dates. Can teh first click do the "Arrive" and the second click do the "Last Night" for booking calendars?
- [❌] **Emails** (only if Resend is configured — see Known gaps): auto-approve → you + the property admin get a calm "booked" note; pending → you + admin get an **"action needed"** email; approve/decline → the booker gets the outcome.
    - Auto-approve worked
    - Booking Confirmation as the booker worked
    - Pending email as the booker did not work
    - Pending email as the admin did not work
    - Auto-approve email as the admin did not work
- [✅] Open the unified **`/calendar`** → confirm the **legend** maps colors to properties and each event reads **`Property · Person (N guests)`** (not just the property name).
    - Move the legend div beneath the calendar rather than at the top of the page
- [✅] Re-add the ICS feed in Google Calendar → event titles read **`Property | Person`**.
- 🔎 If Resend isn't set up yet: do you want to wire it now so the family actually gets notified? (Right now it's check-the-site-only.)
    - Yes, please fix resend

## Session D — Image performance (re-test the round-1 gap)
- [✅] **Re-upload that same ~9MB laptop JPEG** (Session E / gap log from round 1) to a profile or property.
- [✅] Confirm it **uploads and renders fast** now — no multi-second wait.
    - Really well done!!!
- [✅] Open the directory / a gallery with several photos → confirm tiles load quickly (they fetch ~400px thumbnails, not full-res). Check the Network panel if you want: tile requests should be tens of KB, not MB.
    - Where can we see full res? Does it ever make sense to enable full res?
- [✅] Upload a **HEIC** from an iPhone and an **animated GIF** → both should upload fine (HEIC passes through; GIF stays animated).
- 🔎 Any image that still feels slow? Any photo that looks wrongly rotated (EXIF)?

## Session E — UI polish sweep (re-test the round-1 gap log)
- [✅] **Title Case** — nav, page titles, and buttons read like "All Properties", "Add a Contact", "Send Sign-In Link". The small-caps eyebrows (e.g. "OPERATIONS") are intentionally left as-is.
- [✅] **No em-dashes** in on-screen copy (commas/periods/colons instead).
- [✅] **Home** — there's now an explicit "Home" nav link, and the "Mathieson Family" wordmark is clearly clickable.
- [✅] **Profile edit** — the photo uploader is **inline** on the edit page (no separate link).
- 🔎 Anything still in sentence case that should be Title Case, or vice-versa? Any remaining em-dash?

## Cross-cutting
- [✅] **Mobile/iPad** — redo Session A (onboarding) and Session B (guest) on a phone. This is the make-or-break audience.
- [✅] **Empty states** — a brand-new member before they add anything; a property with no bookings.
- [✅] **Theme** — light/dark still clean across the new screens (welcome, guest property, help).

---

## Gap log (round 2)

| Route / feature | What I expected | What happened | Severity | Slice |
|---|---|---|---|---|
| Guest sign-in (Session B) | Magic link sends, guest lands on their property | `email rate limit exceeded` from Supabase Auth — blocked all guest testing | **hi (blocker)** | [14-R2-OPS](../prds/14-booking-notifications.md#round-2--testing-feedback-2026-06-30) — owner action |
| Onboarding (Session A) | New member fully set up | Generation never asked → Directory shows "Generation Not Set"; wants phone + relationship notes too | med | [13-R2](../prds/13-onboarding-welcome-help.md#round-2--testing-feedback-2026-06-30) |
| Booking date picker (Session C) | 1st click = Arrive, 2nd = Last Night | Single tap sets Arrive **and** Last Night to the same day (drag-only model, bad on iPad) | med | [06-R2](../prds/06-property-booking.md#round-2--testing-feedback-2026-06-30) |
| Pending booking email (Session C) | Booker gets an "action needed / pending" note | Never built — only admins are emailed on pending | med | [14-R2](../prds/14-booking-notifications.md#round-2--testing-feedback-2026-06-30) |
| `/calendar` legend (Session C) | — | Wants legend moved **beneath** the calendar | lo | [06-R2](../prds/06-property-booking.md#round-2--testing-feedback-2026-06-30) |
| "Admin emails didn't work" (Session C) | Admin notifications send | **Not a bug** — all four emails delivered (Resend log); admin ones went to Peter's inbox, not the solo tester's | n/a | resolved |
| Full-res photos (Session D) | A way to see originals | Question, not a defect | n/a | [17-R2](../prds/17-image-performance.md#round-2--testing-feedback-2026-06-30) — answered (not building) |

> Turned into the **Round-2 follow-up queue** in [00-master-plan.md](../prds/00-master-plan.md). Each 🟢 slice is its own PR; full specs live in each PRD's "Round 2" section. The one **blocker before more testing** is the Supabase Auth SMTP rate-limit fix (14-R2-OPS, owner action). After this round clears, the natural next big build is still **PRD 11 — Family Legacy**.
