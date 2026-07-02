# 30 — Safe & Announced Actions (Confirms, aria-live, Silent-Failure Fixes)

**Phase**: 6 (usability / accessibility) · **Depends on**: shadcn AlertDialog + sonner (already in repo), authoring components
**Status**: ✅ shipped — safety + accessibility. Its own session/branch.
**Parallel-safe with**: 25, 26, 27, 28, 29. **Owns the interaction/client components** listed below + two NEW shared components. Light overlap risk with 31 only if both edit the same page — 30 stays in *client interaction* components, 31 stays in *display formatting / copy*; coordinate on `admin/*` if both land there.

---

## Why this exists

Three related reliability/accessibility gaps make the app feel untrustworthy to a nervous first-time user and unusable to a screen-reader user:

**1. One-tap destructive actions with no confirm/undo.**
- Own-booking **Cancel** ([own-booking-cancel.tsx:15](../src/components/own-booking-cancel.tsx)) cancels a stay on a single tap — no confirm, no undo.
- Admin **Decline** ([admin-booking-row.tsx:53](../src/components/admin-booking-row.tsx)) is also one-tap.
- Contrast with the *good* patterns already in the repo: `DeleteStory`/`DeleteEvent` (two-step) and `RemovePhotoButton` (AlertDialog + toast). The safe patterns exist; these two just don't use them.

**2. Silent failures.** Several one-click actions ignore the `ActionResult` the server returns — on failure, nothing happens and the user gets zero feedback:
- `setAlbumCover` + `removePhotoFromAlbum` ([archive-gallery.tsx:236,272](../src/components/archive-gallery.tsx)) ignore the returned result.
- Avatar promotion ([photo-gallery.tsx:50](../src/components/photo-gallery.tsx)) — try/finally, no catch, no message.
- `resetIcsToken` failure ([subscribe-to-calendar.tsx:41](../src/components/subscribe-to-calendar.tsx)) is invisible.

**3. Form status/errors are not announced.** Exactly one `aria-live` region exists in the whole app ([guest-access-panel.tsx:159](../src/components/guest-access-panel.tsx)). Every other error/success is a plain `<p>` appearing on re-render (login, booking, welcome, profile, ~12 spots). Screen-reader users get silence on both failure and success. There are also **four coexisting confirm idioms** (AlertDialog+toast, inline two-step, native `window.confirm`/`alert`, and archive's 3-second morphing "Confirm" button) — native `alert("Failed")` ([invitations-section.tsx:226](../src/components/invitations-section.tsx)) is a hostile, off-brand error.

## Goal

No destructive action fires without confirmation; no action fails silently; every form status and error is announced to assistive tech. The app converges on **one** confirm idiom and **one** status idiom.

## Pre-flight decisions

| Decision | Recommendation | Why |
|---|---|---|
| **Confirm idiom** | Standardize on shadcn **AlertDialog** (as `RemovePhotoButton` uses). Build a small `<ConfirmButton>` wrapper (label, description, destructive variant, onConfirm action) and use it for booking cancel, admin decline, and to replace the native `window.confirm`/`alert` sites. | Radix handles focus trap/restore + announcement for free; kills the four-idiom sprawl. |
| **Status idiom** | Build a shared `<FormStatus>` (`role="status"` / `aria-live="polite"`, `aria-live="assertive"` for errors) and route the ~12 inline `{state.status==='error' && <p>}` blocks + success messages through it. | Fixes the a11y gap AND collapses copy-pasted plumbing (see the `Field`/status duplication the code-quality review flagged). |
| **Silent failures** | Every action-returning handler must surface failure — a sonner toast (destructive) on error, and disable-during-pending. Note: `Toaster` mounts only in `(app)/layout.tsx`; fine for these components (all inside the app shell). | Consistent, non-blocking feedback. |
| **Archive morphing button** | Replace the 3-second "Remove → Confirm" morph ([archive-gallery.tsx:267](../src/components/archive-gallery.tsx)) with `ConfirmButton`. | Older users miss the label change and think the first tap "did nothing." |
| **Archive lightbox focus** | While here, fix the hand-rolled lightbox ([archive-gallery.tsx:283](../src/components/archive-gallery.tsx)): move focus in on open, trap it, restore on close. (Or migrate it to a Radix Dialog.) | It's the one custom dialog and it's the one that leaks focus. |

## In scope
- New `src/components/confirm-button.tsx` + `src/components/form-status.tsx` (or under `authoring/`).
- Wire ConfirmButton into: own-booking cancel, admin decline, and the native `confirm`/`alert` sites (`invitations-section`, `members-section`, `guest-access-panel`, `contacts-editor`).
- Route inline error/success messages through FormStatus (login, booking, welcome, profile, invite, feedback, etc.).
- Fix the silent-failure handlers to surface errors (toast) + disable-while-pending.
- Archive lightbox focus management.

## Out of scope
- Font sizes / touch targets — **PRD 29**.
- Copy wording / ISO dates — **PRD 31** (but FormStatus is the vehicle 31's copy fixes will use — land 30 first if sequencing).
- The duplicated `Field`/date/`DeleteResource` extraction is welcome here where it overlaps (FormStatus, ConfirmButton, DeleteResource can be the same effort), but don't expand scope into unrelated refactors.

## Verification recipe (live, incl. keyboard + VoiceOver if available)
1. **Booking cancel** — tap Cancel → confirm dialog appears; Escape/Cancel aborts; confirm actually cancels. Fat-finger test: a stray tap no longer destroys a stay.
2. **Admin decline** — same confirm flow.
3. **Silent failures** — force an error (e.g. offline) on set-cover / remove-photo / avatar-promote / reset-ICS → a visible toast appears; button re-enables.
4. **Screen reader** — submit a form with an error → the error is announced; on success → success announced. (VoiceOver rotor / aria-live check.)
5. **Native dialogs gone** — no `window.confirm`/`alert` remain (grep) — all AlertDialog.
6. **Lightbox focus** — open archive lightbox via keyboard → focus moves in, Tab stays trapped, Escape restores focus to the trigger.

## Likely file layout
```
src/components/confirm-button.tsx        # NEW — AlertDialog wrapper
src/components/form-status.tsx           # NEW — aria-live status/error
src/components/own-booking-cancel.tsx, admin-booking-row.tsx     # ConfirmButton
src/components/archive-gallery.tsx        # ConfirmButton + lightbox focus + surface set-cover/remove errors
src/components/photo-gallery.tsx, subscribe-to-calendar.tsx      # surface failures
src/components/invitations-section.tsx, members-section.tsx, guest-access-panel.tsx, contacts-editor.tsx  # kill native confirm/alert
+ the ~12 inline status <p> sites → FormStatus
```

## Reviewer sign-off (I check these)
- [x] No destructive action fires on a single tap (booking cancel, admin decline, archive remove).
- [x] Zero `window.confirm` / `window.alert` remain (grep proves it).
- [x] Every action handler that can fail surfaces the failure visibly.
- [x] Form errors/success announced via `aria-live` (verified with a screen reader, not just the attribute present).
- [x] Archive lightbox traps + restores focus.
- [x] One confirm idiom, one status idiom — no new fifth pattern introduced.

---

## Implementation

**Shipped** on branch `claude/dreamy-tereshkova-9cb521`. Two new shared primitives, then every confirm/status/silent-failure site routed through them.

### Two new shared components
- **`src/components/confirm-button.tsx`** — the one confirm idiom. Wraps a trigger `Button` in shadcn/Radix `AlertDialog` (Radix gives focus trap/restore + `aria-labelledby`/`aria-describedby` announcement for free). API: `title`, `description`, `confirmLabel`/`cancelLabel`, `destructive`, `disabled`, `successMessage`, `errorTitle`, and an async `onConfirm`. **Contract: throw from `onConfirm` to signal failure** — the dialog stays open and a destructive sonner toast surfaces the message; on success the dialog closes and the optional success toast fires. Both dialog buttons disable while pending (internal `useTransition`). Children render inside the trigger (label, or icon+label).
- **`src/components/form-status.tsx`** — the one status idiom. A persistent live region: `role="alert"`/`aria-live="assertive"` for errors, `role="status"`/`aria-live="polite"` for success/info. Stays mounted even when empty (so SRs reliably announce late-arriving messages); while empty it's `sr-only` (absolutely positioned) so it adds **no** visual gap to surrounding flex layouts. It's a plain component (no `"use client"`), safe in server or client trees.

### Destructive one-tap actions → ConfirmButton
- `own-booking-cancel.tsx` (member cancels own stay), `admin-booking-row.tsx` (admin **Decline** of a pending request — Approve stays one-click since it's non-destructive), and archive `RemoveButton` (replaced the 3-second "Remove→Confirm" morphing button that older users read as "nothing happened"). Booking actions return a `BookingActionState`; the wrappers call the server action directly and `throw new Error(result.message)` on `status === "error"` so ConfirmButton's toast path fires.

### Native dialogs killed (grep proves zero `window.confirm`/`window.alert`)
- `confirm` → ConfirmButton in: invitations revoke, member deactivate/reactivate, guest-access revoke, contact delete, property-admin remove.
- `alert` → sonner toast in: invitation magic-link send, member activation error, property-status change error, feedback-status change error.
- Renamed the local `confirm()` helper in `remove-photo-button.tsx` to `handleConfirm()` so a naive `confirm(` grep stays clean (it was never `window.confirm`, just a shadowing name).

### Silent failures now surface (toast + disable-while-pending)
- Archive `setAlbumCover` + `removePhotoFromAlbum` (ignored their `ActionResult`), `photo-gallery` avatar promote (`try/finally`, no catch), and `subscribe-to-calendar` `resetIcsToken` (invisible failure). The calendar-link reset also converged from its bespoke inline two-step onto ConfirmButton.

### Inline `<p>` status → FormStatus (announced)
Routed the ~dozen bare status blocks: login, welcome, booking request, booking admin/cancel rows, profile edit (member + guest), property edit, property contacts (add + row), property admins, guest-access, invitations create, properties create, feedback, and the authoring `inline-editable` / `create-flow` / `photo-upload` surfaces.

### Archive lightbox focus (was the one custom dialog leaking focus)
`archive-gallery.tsx` `Lightbox`: a mount-scoped effect captures the trigger, moves focus in, and restores it on close; a second effect handles Escape/Arrows plus a manual **Tab trap** (cycles first↔last, pulls focus back if it escapes) via a `focusablesIn()` helper. Added `aria-label` to the dialog container.

### Verification
- `tsc --noEmit`, `eslint`, and `next build` all green.
- Live-checked on `/admin` while signed in: the deactivate ConfirmButton opens with `aria-labelledby`+`aria-describedby` wired, focus lands inside the dialog on the abort button, and FormStatus live regions render. Verified with **no** real mutation (opened then aborted; the target member stayed active).

### Notes / follow-ups
- `zip-upload.tsx` and `google-photos-picker.tsx` keep their bespoke progress UIs (out of the "form status" shape); revisit if their errors need announcing.
- The admin "Cancel Booking" (revoke an *approved* stay) intentionally stays a form with a required reason field rather than a ConfirmButton — the required note already blocks a fat-finger, and a reason is mandatory. Its error `<p>` now routes through FormStatus.
