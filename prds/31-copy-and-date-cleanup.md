# 31 — Copy & Date-Format Cleanup

**Phase**: 6 (usability polish) · **Depends on**: nothing structural
**Status**: 🟢 ready — small, high-comfort polish. Its own session/branch.
**Parallel-safe with**: 25, 26, 27, 28, 29. Owns **display formatting in server pages** + **static copy** + a NEW `src/lib/dates.ts`. Stays out of the client interaction components 30 owns; if both must edit an `admin/*` file, 30 takes the child client component and 31 takes the server page — coordinate on the seam.

---

## Why this exists

Small dev-isms leak into member-facing copy and undercut the "calm, plain-language" tone the rest of the site works hard for (see the excellent `/help` guide as the bar). Found in the 2026-07-01 review:

- **Raw ISO dates** shown to users: "arrive 2026-07-01, depart 2026-07-15" on `/calendar` ([calendar/page.tsx:172](../src/app/(app)/calendar/page.tsx)) and the admin pending list ([admin/page.tsx:154](../src/app/(app)/admin/page.tsx)) — while the property calendar formats them nicely via `formatRange` ([properties/[slug]/calendar/page.tsx:44](../src/app/(app)/properties/[slug]/calendar/page.tsx)). Inconsistent, and ISO dates read as "computer output" to an older user.
- **"Saved. Logged to revisions."** ([inline-editable.tsx:32](../src/components/authoring/inline-editable.tsx), [property-edit-form.tsx:183](../src/components/property-edit-form.tsx)) — "revisions" is dev-speak.
- **"magic link"** wording on `/invite` ([invitations-section.tsx:135,210](../src/components/invitations-section.tsx)) while the login page carefully says "sign-in link" — inconsistent within the same app.
- **Raw role enums** `member/admin/guest` in the invite role dropdown ([invitations-section.tsx:89](../src/components/invitations-section.tsx)).
- **"Generation Not Set"** as a Directory heading (live: Peter's row) — data that predates the 13-R2 generation field; needs a one-row backfill, not just copy.
- **Peak window format** "06-01 → 08-31" on the booking page — machine-ish; a friendlier "June 1 – August 31" reads better.

Date formatting also exists **three different ways** across the app (`formatRange`, `formatHumanDate` in booking-request-form, a hand-rolled month array in archive-gallery) — the inconsistency is structural, so the fix is a shared helper, not more one-offs.

## Goal

No raw ISO dates or dev jargon in member-facing copy; one shared date-formatting helper; consistent "sign-in link" language; the Directory shows a real generation for existing members.

## Pre-flight decisions

| Decision | Recommendation | Why |
|---|---|---|
| **Date helper** | Add `src/lib/dates.ts` with `formatHumanDate`, `formatRange` (nights-aware), and a month-day formatter for peak windows; migrate `/calendar`, `/admin`, booking form, and archive to it. | Kills the 3-way duplication and the raw-ISO inconsistency in one move. `date-fns` is already a dependency. |
| **"revisions" copy** | "Saved." (or "Saved. Your change is recorded.") — drop the table name. | The audit trail is a feature *for you as reviewer*, not language for family. |
| **"magic link" → "sign-in link"** | Standardize on "sign-in link" everywhere (match the login page). | One term, the friendlier one. |
| **Role dropdown** | Show friendly labels ("Family member", "Admin", "Guest (one home)") mapped to the enum values; keep the enum as the submitted value. | Members shouldn't see raw enums. |
| **Generation backfill** | This is partly **data**: set Peter's (and any other pre-13-R2 member's) generation. Do it as a one-off (SQL/admin) and confirm the Directory heading logic already handles a set value. Copy fallback ("Generation not yet set" sentence-case, less heading-shouty) for genuinely-unset rows. | The heading is a symptom; the row data is the cause. |
| **Copy rules** | Follow the standing conventions ([copy-style.md]): Title Case buttons/nav/titles; sentence case body + email subjects; **no em-dashes** in user-facing copy. | Don't reintroduce what PRD 16 scrubbed. |

## In scope
- `src/lib/dates.ts` + migrate the 4 date-display sites to it.
- Copy fixes: "revisions" → plain; "magic link" → "sign-in link"; friendly role labels; friendlier peak-window format.
- Generation: backfill existing members' generation + soften the unset-fallback copy.

## Out of scope
- aria-live / confirmation / silent-failure (PRD 30) — though the "Saved." copy lives in components 30 may also touch; coordinate on `inline-editable.tsx` if both land (30 for status idiom, 31 for the words).
- Font sizes (PRD 29).
- Any new date *features* (ranges on events etc.).

## Verification recipe
1. **No ISO dates** — `/calendar` upcoming list and `/admin` pending list show "July 1 – July 15" style, matching the property calendar. Grep for `YYYY-MM-DD`-style output in JSX.
2. **Jargon gone** — save an inline edit → "Saved." (no "revisions"); `/invite` says "sign-in link"; role dropdown shows friendly labels.
3. **Directory** — Peter's row shows his real generation; no "Generation Not Set" heading for existing members.
4. **Copy conventions** — no em-dashes in the touched strings; Title Case on buttons, sentence case in body.
5. **No date regressions** — booking summary, archive dates, ICS titles unchanged in meaning after the helper swap.

## Likely file layout
```
src/lib/dates.ts                                  # NEW — shared formatters
src/app/(app)/calendar/page.tsx, admin/page.tsx   # use formatRange
src/components/booking-request-form.tsx, archive-gallery.tsx  # use shared formatters
src/components/authoring/inline-editable.tsx, property-edit-form.tsx  # "Saved." copy
src/components/invitations-section.tsx            # "sign-in link" + friendly role labels
+ one-off generation backfill (SQL or admin action)
```

## Reviewer sign-off (I check these)
- [ ] No raw ISO date appears in any member-facing view (grep + live check).
- [ ] All three prior date-format implementations now route through `lib/dates.ts` (no new 4th one-off).
- [ ] No em-dashes reintroduced; Title Case / sentence case per the standing rules.
- [ ] "revisions" and inconsistent "magic link" wording gone.
- [ ] Existing members show a real generation (data fixed, not just the heading hidden).
