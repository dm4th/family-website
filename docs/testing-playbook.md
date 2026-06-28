# Testing Playbook — experience every feature, find the gaps

A guided walkthrough of everything shipped, organized by who's using it. Work through the sessions, tick the boxes, and log anything that made you hesitate in the **Gap log** at the bottom. The 🔎 notes call out things likely to be rough.

> **Known gaps — don't log these as bugs (they're not built yet):**
> - No notifications/emails anywhere except invite magic links — the site is check-it-yourself today.
> - No Legacy UI (people/tree/archive/timeline/stories) — the `people` data exists in the DB but isn't surfaced.
> - No comments/messaging, no global "all photos" gallery, no search.
> - Calendar feeds refresh on the calendar app's schedule (a few hours), not live.
> - Coming-soon pages (Documents, Finances, Messaging, Timeline) are informational stubs.

## Setup
- Two identities: your **admin** account + one **plain member**. Easiest: invite a second email you control and drive it in an **incognito window** beside your main one.
- Test on a **laptop and a phone/iPad** — the eldest generation is the real audience.

---

## Session A — New member's first 5 minutes (member account, incognito)
- [ ] Open the invite magic link → do you land somewhere sensible, or a cold dashboard?
- [ ] Read the dashboard greeting + gateways — would a 70-year-old know what to click?
- [ ] **Directory** → open a few profiles. Are people recognizable (photo, name, relationship)?
- [ ] **`/profile/edit`** → set avatar, write a **bio with the toolbar** (bold, bullet list, Preview), upload a profile photo.
- 🔎 Is it obvious how to edit your own profile? Does the bio editor feel friendly or technical? Does the avatar update everywhere? Any "what is this site" orientation, or dropped in cold?

## Session B — Property wiki editing (what the family maintains)
- [ ] Open a property → **Edit**. Change "How things work" with the toolbar (heading, list, link).
- [ ] Add/remove an **amenity** (chips). Save → confirm "Saved. Logged to revisions."
- [ ] Add a **contact**, edit it, delete it. Upload a property photo.
- 🔎 The **link tool** inserts `[text](https://)` — you still type the URL by hand. Does editing feel safe/reversible? Should non-admin members be able to edit?

## Session C — Booking (the flagship)
- [ ] As **member**, request dates; try an overlap → see the **conflict warning**.
- [ ] Request dates in a **peak period** → should land `pending`, not auto-approve.
- [ ] As **admin**, **approve** one request, **decline** another.
- [ ] Open unified **`/calendar`** → color-coded across properties.
- [ ] **Subscribe security smoke test:** copy your feed URL from `/calendar`, open it in **fresh incognito (no login)** → you get the `.ics`. Then `/api/ics/me` with **no token** in incognito → **401**. Then **"Reset my calendar link"** → old URL now 401s.
- 🔎 Nobody is *notified* of requests/approvals — in-app panels only. Will your dad know a request is waiting?

## Session D — Admin powers (you / your dad)
- [ ] **Invite** a member; **revoke** a pending invite; **resend** a magic link.
- [ ] **Change a role**; **deactivate** then reactivate someone → confirm they leave/return the directory.
- [ ] **Create a property**; set maintenance/inactive → confirm it hides from the listing.
- [ ] Grant **property admin** on one property → confirm they can approve that property's bookings but not others'.
- 🔎 Is site-admin vs per-property-admin understandable? Any way to lock yourself out?

## Session E — Photos
- [ ] Upload from **device** and **phone camera**. Import via **Google Photos**.
- [ ] **Tag** people in a photo. **Remove** your own photo; confirm another member can't remove yours.
- 🔎 No "all photos" gallery — photos live only on the profile/property they're attached to. Does Google Photos import work for a non-techie?

## Cross-cutting passes
- [ ] **Mobile/iPad**: redo A–C on a phone — tap targets, editor toolbar, calendar grid, upload.
- [ ] **Theme**: toggle light/dark — anything unreadable?
- [ ] **Empty/edge states**: new member with no photo; property with no bookings; very long names.
- [ ] **Dead ends**: coming-soon pages read as "planned," not "broken"?

---

## Gap log

| Route / feature | What I expected | What happened | Severity (lo/med/hi) |
|---|---|---|---|
| | | | |
| | | | |
| | | | |

> Bring this back filled in and we'll turn the real findings into the next slice queue (and smooth the worst before the family readout).
