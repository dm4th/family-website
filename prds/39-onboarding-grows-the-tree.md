# 39 — Onboarding That Grows the Tree

**Phase**: 7 (family growth) · **Depends on**: 24 (invite-only access, shipped), the generations reset (Bibi and Drew = 1, PR #48 + data script), PRD 13 (welcome flow, shipped)
**Status**: 🚧 built + reviewed 2026-08-01 (branch `prd-39-onboarding`) — both slices code-complete; reviewed against a real local Postgres, two required fixes applied and re-verified. `tsc` / `eslint` / `build` green, 13/13 generation checks. **Migrations validated locally but not applied to prod, and no live walk yet** (see Implementation).
**Parallel-safe with**: property-side PRDs (35–38). Touches `/welcome`, `/invite`, the invitations table, and the tree write path — do not run alongside another onboarding or tree PRD.

---

## Why this exists

Dan's ask: *"draft updates to the onboarding flow so that the tree will fill out on its own over time. It needs to be clear for people how to create their accounts and not abandon it."*

The evidence, all live on prod today:

- **The tree doesn't grow.** Onboarding writes only to `profiles`. The `relationships` table was empty until the 2026-08-01 reset script, and every person row was hand-seeded. Nobody who onboarded ever appeared in the tree.
- **The structured data is already being typed — as prose.** The welcome form's "Relationship notes" field collects exactly what the tree needs ("Married to Maggie, Son of Peter and Carol" — Dan's actual notes) and stores it as free text that connects nothing.
- **Invitations don't send an email.** `createInvitation` inserts a row and stops; the invitee learns about the site only if the inviter texts them the URL and remembers to say "use this exact email". The email layout's own comment says "invitations later". Later is now.
- **Abandonment is real and observed.** m.mathieson1183@gmail.com (Mike) signed in once, skipped, and never came back: no name, no generation, invisible in the directory for weeks. The nudge stops nagging once name + branch exist and is dismissible per session, so a half-finished profile stays half-finished.
- **Generation was the most-fumbled question.** Carol picked 1, Peter picked 2 — both wrong under the old scheme. The renumbering (PR #48) fixes the labels; this PRD makes the answer mostly unnecessary by deriving a suggestion from where you sit in the tree.

## Goal

Two slices, buildable as two sessions or one:

**Slice A — the invitation actually invites.** Sending an invitation sends a warm email that tells the person exactly what to do (go here, enter this same email address, click the link we send you), and the inviter records who the person is to them so the tree step can greet the invitee with their family already half-placed.

**Slice B — onboarding places you in the tree.** The welcome flow becomes three short steps; the new middle step ("Your place in the family") asks who your parents and spouse are with pickers over the existing tree, and finishing writes real `people` + `relationships` rows. Every completed onboarding grows the tree by at least one node and its edges. The nudge keeps nagging until placement is done.

## What already exists (don't rebuild)

| Piece | State |
|---|---|
| Invite-only auth | PRD 24 shipped: `invitations` table (email, role, token, status, expires_at, grant_property_id), member-facing `/invite`, `handle_new_user()` rejects uninvited signups, `/no-invite` landing |
| Email infra | `src/lib/email/resend.ts` + `layout.ts` (booking + feedback emails as precedent; Title Case CTA buttons, sentence-case subjects, no em-dashes) |
| Welcome flow | `src/app/welcome/` — single Family-mode card, required name/branch/generation, `completeOnboarding` / `skipOnboarding`, `onboarded_at` gate, `ProfileNudge` on the dashboard |
| Tree data + helpers | `people`, `relationships` (`person_a` = parent of `person_b`; spouse undirected), `deriveRelatives()` in `src/lib/family-tree.ts`, member-facing PersonCreate + per-page relative adding |
| Generation scheme | Top-anchored (Bibi and Drew = 1). `GENERATION_HINT`, `generationAnchor()`, `GenerationSelect` (PR #48) |
| Live anchors | After the reset script: Bibi, Drew, Peggy, Andy, Peter, Carol + gen-3 people, all connected — so pickers have something to pick from on day one |

## Pre-flight decisions

| Decision | Recommendation | Why |
|---|---|---|
| **Invitation email** | One email at creation via the existing Resend layout. Subject sentence-case ("You're invited to the Mathieson family site"). Body: who invited you (inviter's name), what the site is (one warm sentence), then a numbered how-to: press the button, enter **this** email address, open the magic link we send. CTA button "Accept Your Invitation" → `/login?email=<invited>`. | The #1 abandonment point is before the site is ever reached. The email must pre-empt the two known failure modes: using a different email address, and not understanding that "no password" is normal. |
| **`/login` prefill** | `?email=` query param prefills (not locks) the email field. | Removes the "which email was I invited under?" fumble; still editable because people forward emails. |
| **Kinship at invite time** | Add `relation_to_inviter` (enum: `parent`, `child`, `sibling`, `spouse`, `other`) + nullable `relation_note` text to `invitations`, collected via one optional select on the invite form ("Who are they to you?"). | The inviter knows the relationship better than the invitee knows the tree. One optional field, no picker over people (the invitee confirms against real tree rows later; don't make the inviter do data entry). |
| **Welcome flow shape** | Three titled steps with a "Step 1 of 3" line: **1. Who you are** (name, branch, phone) → **2. Your place in the family** (tree step, below) → **3. A face and a few words** (photo, bio, both optional, big "Finish" button). One primary button per screen. "Finish Later" available on every step. | The current single card is six fields deep and the primary button is below the fold on an iPad. Short steps with visible progress are the standard abandonment fix and match the older-user bar (one decision per viewport). |
| **The tree step** | Two questions with pickers over existing `people` (grouped: likely matches from the inviter's kinship answer first): "Who are your parents?" (multi-select, typically two) and "Are you married? To whom?" (single select). Each picker has "They're not listed" → inline name field that creates a stub person. Children are NOT asked. | Parents + spouse are the two edges that place a person; children get placed when *they* onboard or via the existing tree pages. Stubs keep the step unblocked when a parent predates the site. |
| **Own person row: claim, then create** | On finishing the tree step: if an unlinked `people` row case-insensitively matches the member's name, show it ("Are you this Dan Mathieson, born 1994?") to claim (sets `profile_id`); otherwise create a person row from the profile (display_name = full_name, family_branch copied). Never auto-claim silently. | The Maggie/Mike problem: hand-seeded rows already exist for people who later get accounts. Silent auto-claim on a name match would eventually link the wrong Drew Mathieson; the confirm makes it safe and the birth-year line makes it decidable. |
| **Generation: suggest, don't ask first** | When a chosen parent resolves to a generation (their linked profile's generation, else `parent-of-parent` depth from Bibi/Drew via edges), preselect `parent + 1` in the existing `GenerationSelect` with the hint "Suggested from where you sit in the tree. Change it if we got it wrong." No parents chosen → picker behaves as today. Generation stays required and member-confirmable. | Derivation kills the most-fumbled question for the common case without making the tree authoritative over a human answer. Keeps Dad's explicit numbering as the source of truth. |
| **When edges are written** | On the tree step's save, server-side, in one action: claim-or-create own person, create stubs, insert `parent`/`spouse` edges (dedup-checked both directions), all stamped `created_by`. Skipping the step writes nothing. | Same "nothing saved until you press Save" contract as the rest of the site. Partial writes from an abandoned step would seed duplicate stubs. |
| **Nudge upgrade** | `ProfileNudge` shows until name + branch + generation set **and** the profile has a linked person row; copy names what's missing ("Add yourself to the family tree"); still dismissible per session but returns next visit. | "Complete" now includes being in the tree. The current nudge declared victory too early. |
| **Existing members backfill** | Out of scope for the build; the 2026-08-01 reset script already placed all five current members. New members go through the new flow. | Backfill is done; don't build machinery for a one-time event. |
| **Guests** | Entirely excluded: no tree step, no invitation kinship field on guest invites, no person row. | Guests aren't family; the tree is. |
| **Reminder emails for stalled invites/onboarding** | Out of scope; log as follow-up. | Worth doing only if abandonment persists after the email + steps land. Measure first. |

## In scope

- Migration: `invitations.relation_to_inviter` (check-constrained) + `invitations.relation_note`; nothing else schema-side (people/relationships unchanged).
- Invitation email template (`src/lib/email/invitation-email.ts`) + send on create; `/login` `?email=` prefill.
- Invite form: optional "Who are they to you?" select + note, hidden for guest invites.
- Welcome flow restructure into three steps (client-side steps, one server action per step or one at the end — builder's call, keep "Finish Later" honest).
- Tree step UI + server action: claim-or-create person, stub creation, edge writes, generation suggestion.
- `ProfileNudge` completeness rule + copy.
- Admin roster: show "hasn't finished onboarding" state if not already visible (small).

## Out of scope

- Children pickers, sibling edges (derived), grand-relations. The two-question step is the whole ask.
- Editing/removing edges from onboarding (tree pages own that).
- Backfill of existing members; reminder/re-invite emails; invitation expiry changes.
- Any change to guest onboarding.

## Verification recipe

1. **Invite → inbox → in**: invite a test email with "child" kinship → email arrives, renders in Gmail, CTA lands on `/login` with the address prefilled → magic link → welcome step 1.
2. **Tree step happy path**: pick Peter + Carol as parents, Maggie as spouse → finish → `people` has a new linked row, 3 edges exist with `created_by`, tree page shows the new member connected, generation was preselected 3.
3. **Claim path**: onboard as a name matching an unlinked seeded person → claim card appears → claiming sets `profile_id`, no duplicate person.
4. **Stub path**: "parent not listed" + a typed name → stub person created once, edge attached; re-running the step doesn't duplicate it.
5. **Skip honesty**: "Finish Later" on step 2 → zero people/relationships writes; nudge on the dashboard names the tree; returning resumes cleanly.
6. **Guest invite**: no kinship field, guest onboarding unchanged, no person row.
7. **Abandonment regression**: a fresh member who completes only step 1 shows in the admin roster as unfinished.
8. `tsc` / `eslint` / `build` green; RLS confirms members can insert people/relationships but guests cannot (existing policies; verify, don't assume).

## Likely file layout

```
supabase/migrations/<ts>_invitation_kinship.sql
src/lib/email/invitation-email.ts
src/app/(app)/admin/actions.ts                  # send email on create; kinship fields
src/app/(app)/admin/invitations-section.tsx     # "Who are they to you?" select
src/app/(auth)/login/…                          # ?email= prefill
src/app/welcome/welcome-flow.tsx                # three steps
src/app/welcome/tree-step.tsx                   # pickers, claim card, stubs
src/app/welcome/actions.ts                      # tree-step server action + generation suggestion
src/components/profile-nudge.tsx                # completeness rule + copy
src/lib/family-tree.ts                          # generation-from-edges helper (pure)
```

## Reviewer sign-off (I check these)

- [ ] Invitation email: renders in Gmail, sentence-case subject, Title Case CTA, no em-dashes, the three-step how-to present, magic-link expectation set.
- [ ] Tree step writes are all-or-nothing on save, `created_by`-stamped, dedup-safe on retry; skipping writes nothing.
- [ ] Claim is confirm-only (never silent), and the confirm shows enough (lifespan line) to distinguish same-name people (two Drew Mathiesons exist).
- [ ] Generation suggestion matches `parent + 1` against the live data and never overrides an explicit member choice.
- [ ] Nudge persists until tree placement; "Finish Later" is never punished.
- [ ] Guests fully excluded; RLS verified for member inserts on people/relationships.
- [ ] Live walk: invite a real test address end-to-end, onboard placing myself against seeded anchors, verify the tree renders the new edges, then clean up the test rows.

---

## Implementation (2026-08-01, branch `prd-39-onboarding`)

Both slices built in one session. Everything below is code-complete and passes
`tsc` / `eslint` / `next build`; **nothing has been run against a database.**

### Key files

| File | What it does |
|---|---|
| `supabase/migrations/20260801000001_invitation_kinship.sql` | `invitations.relation_to_inviter` (check-constrained) + `relation_note`, plus `my_invitation_hint()` |
| `supabase/migrations/20260801000002_place_self_in_tree.sql` | `place_self_in_tree()` — the atomic placement |
| `src/lib/email/invitation-email.ts` | The warm invitation email |
| `src/lib/email/layout.ts` | Gained `mode` (family burgundy / operations forest) + `footer` |
| `src/app/(app)/admin/actions.ts` | Kinship capture + best-effort send on create |
| `src/app/(app)/admin/invitations-section.tsx` | "Who are they to you?" (hidden for guests), honest success copy |
| `src/app/(auth)/login/*` | `?email=` prefill + invitation-aware header |
| `src/app/welcome/actions.ts` | `saveIdentity` / `savePlacement` / `finishOnboarding` / `findClaimCandidates` |
| `src/app/welcome/tree-step.tsx` | Pickers, claim card, stubs, generation suggestion |
| `src/app/welcome/welcome-flow.tsx` | The three steps |
| `src/lib/family-tree.ts` | `generationOfPerson()` + `suggestGeneration()` (pure) |
| `src/components/profile-nudge.tsx` | Gap-aware nudge |
| `evals/onboarding/generation-check.mts` | 13 checks on the derivation, no DB or API key |

### Decisions made during the build

- **Atomicity needed a SQL function.** "All-or-nothing on save" is unachievable
  through supabase-js, which issues one statement per call. `place_self_in_tree`
  is `SECURITY INVOKER`, so the existing `people` / `relationships` RLS is still
  the authority; it grants nothing a member couldn't already do one row at a time
  from the tree pages, it only makes the group atomic. Guests are rejected inside
  it as well, behind RLS.
- **The invitee cannot read their own invitation.** RLS scopes `invitations`
  SELECT to the inviter, so the kinship hint needed `my_invitation_hint()`, a
  `SECURITY DEFINER` reader matched on the caller's own `auth.users` email and
  returning only two fields. Widening the RLS policy was the alternative and was
  rejected: it would expose the invite list keyed by email.
- **The email drives to `/login`, it does not carry a magic link.** The premise
  "invitations don't send an email" turned out to be half stale: there is already
  a manual per-row "Email Magic Link" button sending Supabase's raw OTP mail.
  Embedding a second link would mean two competing sign-in emails, and links in
  forwarded mail age badly. Prefilling `?email=` gets the same result. The old
  button stays as a manual fallback.
- **Per-step saving, not one save at the end.** Directly targets the observed
  failure: step 1 alone now puts a name in the directory, so an interrupted first
  run leaves something behind.
- **Suggestion never overrides a choice.** `GenerationSelect` gained optional
  controlled props; the field follows the derived suggestion only until the
  member touches it, and an already-saved generation always outranks a guess.
- **Kinship suggests, it never writes.** The inviter's answer produces a one-tap
  "Add X as your parent?" row, not a pre-filled picker, so no edge can be created
  by not noticing something.
- **`relationship_notes` dropped from the welcome form.** It is the prose field
  this PRD exists to replace. The column and the profile-edit field are untouched.

### Bugs found and fixed on the way

- **Nested `<form>` in the welcome flow (pre-existing).** "Finish Later" lived in
  a `<form>` nested inside the step's form. HTML parsers drop the inner one, so
  the button was a submit for the outer form. Replaced with `formAction` +
  `formNoValidate` on the button.
- **`/welcome` was a dead end for returners.** It redirected out whenever
  `onboarded_at` was set, so the nudge's "Add yourself to the family tree" link
  would have bounced straight back to the dashboard. The gate now also requires
  identity + generation + placement, and the flow resumes at the first unfinished
  step.
- **Spouse-edge dedup was one-directional.** `ON CONFLICT` only catches the
  canonical ordering; a hand-seeded reversed row would have produced a mirror
  edge. Now checked in both directions explicitly.
- **Sibling suggestions would have silently dropped.** The name lookup was built
  only from people with linked profiles, but a sibling's parents are usually
  accountless ancestors. Now loaded from all people.

### Review (2026-08-01) and the two fixes it required

Reviewed against a real local Postgres (`supabase db reset`, functional tests as
authenticated JWTs, rolled back). Both migrations apply cleanly. The review
confirmed `my_invitation_hint()` scoping, atomic placement, canonical spouse
ordering, idempotent retry, guest rejection, and self-parent filtering, and
endorsed both deviations from the original spec. It found two real defects:

1. **Accepting a suggestion wiped manual picks.** The suggestion rows re-seeded
   `PeoplePicker` by changing its `key`, which remounted it with
   `defaultSelected` = the suggestion alone. Picking a parent by hand and then
   pressing "Add" on a suggestion silently dropped the hand-picked one.
   **Fixed**: `onSelectionChange` now emits whole people rather than ids, the
   step tracks the live selection, and applying a suggestion seeds the *union*.
   The spouse suggestion also hides once a spouse is chosen, since only one is
   accepted.
2. **Claim race.** The claim path SELECTed `profile_id`, checked null, then
   UPDATEd without rechecking, so two same-named people claiming concurrently
   would let the second silently overwrite the first's link. The partial unique
   index on `people(profile_id)` does not catch this (it prevents one profile
   owning two rows, not two profiles racing for one). **Fixed**: the null check
   moved into the UPDATE's WHERE, with `if not found then raise`.

Also applied from the review's nits: `my_invitation_hint()` now filters to
`status in ('pending','accepted')` so a revoked invitation stops suggesting
family ('accepted' must stay — the hint is read after sign-in, once
`handle_new_user()` has marked it accepted). Uncapped server-side stub creation
is documented in the migration as deliberate and consistent with existing member
powers.

Verified after the fixes on the local stack: steal-claim rejected with 23505 and
the original link intact; revoked hints suppressed while pending and accepted
still work; placement, idempotent retry, and canonical spouse ordering unchanged.
`tsc` / `eslint` / `build` green, 13/13 generation checks.

Fix 1 is verified by inspection and build only — the repo has no component test
harness, so the interaction itself is covered by the live walk below.

### Not done — required before this ships

1. **No live walk.** Every numbered item in the Verification recipe above is
   outstanding, including the reviewer sign-off list.
2. **Guest negative suite** (recipe item 6) not run.
3. **Email not sent through Resend once.** Rendering was verified offline for
   both variants (subject, CTA casing, no em-dashes, both how-to paths); Gmail
   rendering was not.

### Ship order (matters here)

Apply **both migrations to prod before merging the code** — the PRD-36 lesson.
The welcome page calls `my_invitation_hint()` on load, so shipping code first
would break `/welcome` for everyone.

### Pre-existing bug found (not this PR's)

`handle_new_user()`'s rejection path has a malformed `RAISE` ("RAISE option
already specified: MESSAGE"). Uninvited signups still fail closed, but with an
internal error instead of the intended message. Worth a one-liner someday; it is
also why any test seeding `auth.users` must insert the invitation first.

### Follow-ups

- `place_self_in_tree` currently accepts one spouse. Remarriages need the tree
  pages, which is consistent with the PRD's scope but worth saying out loud.
- The plaintext email footer was unified with the HTML one (they had drifted);
  booking/feedback plaintext footers now read slightly differently than before.
- Reminder emails for stalled invites remain deliberately out of scope: measure
  first, as the PRD says.
