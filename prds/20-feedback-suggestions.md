# 20 — Feedback & Suggestions

**Phase**: 5 · **Depends on**: 14 (Resend wired), plus the standard auth/RLS/authoring foundation
**Status**: 🟢 ready — scoping agreed 2026-07-01. Small. Its own session/branch.

---

## Why this exists

The site is now big enough that the family — not just Dan — should be able to say "this is confusing" or "could we add X" from inside the app. Right now feedback lives in text messages to Dan and gets lost. This is also the channel that lets the family **prioritize the roadmap themselves**: cheap to build, compounding in value, and it directly informs which of the larger backlog features (guestbook, stays/blasts, ChatOps) matter most.

## Goal

Any family member can, from anywhere in the app, open a short form and suggest a feature or report a problem in one or two sentences. Submissions are **captured durably** (a table Dan can browse) and **surfaced to admins** (an email), so nothing is lost and Dan can triage.

## Onboarding (read first if you're picking this up cold)

1. **Read** [CLAUDE.md](../CLAUDE.md), [00-master-plan.md](00-master-plan.md), then this file.
2. **You will reuse**: the Server-Action write + `revalidatePath()` pattern; RLS conventions (`not is_guest()` where relevant, `is_admin()` for the admin view); the **Resend** send helper wired in [14 — Booking Notifications](14-booking-notifications.md) (`src/lib/notifications/` + the email templates) — reuse it, and respect its **best-effort, gated-on-`RESEND_API_KEY`** posture (no key → log-and-skip, submission still succeeds). Copy conventions from `family-office-ui` (sentence-case body/labels, Title Case buttons, no em-dashes).
3. **Classify the surface** with `page-mode-orchestrator` — a feedback form is light **Advisory** (a memo to the stewards) or neutral Family; keep it calm and unobtrusive, not a marketing "we value your feedback!" banner.

## Pre-flight decisions (decide before code)

| Decision | Recommendation | Why |
|---|---|---|
| **Entry point** | A persistent, low-key **"Suggest an idea" / "Send Feedback"** link in the footer or user menu — reachable from every page, never in the way. **Must also appear in the stripped guest shell** (guests can submit too). | Feedback must be one click from anywhere without cluttering the shell — including for guests, whose nav is otherwise minimal. |
| **Fields** | `category` (Idea / Problem / Other), a short `message` (required), optional `page_url` auto-captured | Minimal friction; the category + URL make triage fast. |
| **Storage** | A `feedback` table (submitter, category, message, page_url, status, audit cols) | Durable + browsable; email alone loses history. |
| **Notify** | Email admins (Dan + site admins) via the existing Resend helper, best-effort | Dan sees it immediately; the table is the record. |
| **Admin view** | A simple `/admin/feedback` list (newest first) with a `status` (New / Seen / Planned / Done) | Turns raw suggestions into a triage queue without a heavy tool. |
| **Guests?** | **Yes — guests can submit feedback too** (decided 2026-07-01) | A guest hitting a rough edge is exactly the signal Dan wants; don't silence it. Guests insert their own rows like members. (The property-scoped guestbook in PRD 21 is a separate, additive channel — not a replacement for guest product feedback.) |
| **Anti-spam** | None beyond auth (it's a closed family app) | No public exposure; over-engineering unwarranted. |

## In scope
- **`feedback` table** + RLS: **any authenticated user (members _and_ guests) inserts their own row** (`created_by = auth.uid()`, no `is_guest()` block on insert); **admins read all**; a submitter may read their own row; updates (status) admin-only. Note this is deliberately *not* the usual `not is_guest()` gate — feedback is the one write guests are allowed site-wide, so the insert policy must permit them.
- **Submit UI**: a small dialog/sheet (reuse `CreateFlow` or a plain shadcn `Dialog`) reachable from a footer/user-menu link on every page; category + message + auto `page_url`; a clear "Thanks, we got it" confirmation.
- **Server Action** `submitFeedback`: inserts with `created_by = auth.uid()`, then best-effort Resend email to admins. Failure of the email must not fail the submission.
- **Admin triage** at `/admin/feedback`: newest-first list, category badge, message, submitter, source page, and a `status` the admin can advance. Gate with `requireAdmin()`.

## Out of scope (initial)
- Voting / upvoting on suggestions (revisit if volume warrants).
- Public roadmap / status-back-to-submitter notifications (could add later: "your idea is Planned").
- Threaded discussion on a suggestion (that's closer to PRD 09 messaging).
- Attachments/screenshots.

## Verification recipe
1. **Submit** — from a deep page (e.g. a property), open Send Feedback, pick "Idea", type a sentence, submit → see a thank-you; the row exists with the correct `page_url` and `created_by`.
2. **Admin sees it** — as Dan, `/admin/feedback` lists it newest-first; advance its status to "Seen"; the change persists.
3. **Email** — with Resend configured, an admin notification arrives; **with `RESEND_API_KEY` unset**, the submission still succeeds (log-and-skip), no error to the user.
4. **Guest can submit** — sign in as a guest: the Send Feedback entry is reachable from their stripped shell, a submission succeeds and lands in `/admin/feedback` with their `created_by`.
5. **Authz** — a non-admin (member or guest) cannot open `/admin/feedback`; a submitter cannot read anyone else's submissions via the API.
6. **Copy** — Title Case buttons, sentence-case labels, no em-dashes; calm tone.
7. **Mobile** — the dialog is comfortable on an iPad; the entry link is reachable.

## Likely file layout

```
supabase/migrations/YYYYMMDD_feedback.sql     # feedback table + RLS
src/lib/db/schema.ts                           # mirror

src/components/feedback/
  feedback-button.tsx                          # footer/user-menu entry (client)
  feedback-dialog.tsx                          # category + message form

src/app/(app)/feedback/actions.ts              # submitFeedback (insert + best-effort email)
src/app/(app)/admin/feedback/page.tsx          # admin triage list
src/app/(app)/admin/feedback/actions.ts        # updateFeedbackStatus (requireAdmin)
```

## References / reuse
- Resend helper + templates in `src/lib/notifications/` (PRD 14) — best-effort, gated on `RESEND_API_KEY`
- `requireAdmin()` (`src/app/(app)/admin/actions.ts`) + `is_admin()` — admin gating
- `CreateFlow` / shadcn `Dialog` — the submit surface
- Server-Action + `revalidatePath()` write pattern; `family-office-ui` copy rules

## Implementation

_Filled in when this ships._

- **Status**: not started
- **Key files**:
- **Decisions made during build**:
- **Open follow-ups**:
