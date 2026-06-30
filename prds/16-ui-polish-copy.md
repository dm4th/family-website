# 16 — UI Polish & Copy

**Phase**: 3 (polish) · **Depends on**: —
**Status**: ✅ shipped

---

## Onboarding (read first if you're picking this up cold)

1. **Read** [CLAUDE.md](../CLAUDE.md) — especially the **Design system** section (the "private family office meets premium members club" direction, the three emotional zones, and the **five non-negotiables**) and the **Conventions** section.
2. **Read [AGENTS.md](../AGENTS.md)** — this is Next.js 16, not the one your training data knows. None of this PRD needs new framework APIs, but heed it before touching routes.
3. **Skim the design skill** [.claude/skills/family-office-ui/SKILL.md](../.claude/skills/family-office-ui/SKILL.md). It governs typography (Fraunces for hero titles only; Inter everywhere else) and the **`Eyebrow`** device (small-caps, letter-spaced, uppercase). The casing decision in this PRD deliberately **leaves the eyebrow device alone** — see Pre-flight decisions.
4. **Source of these items**: the testing-pass [docs/testing-playbook.md](../docs/testing-playbook.md) — the **Gap log** table (rows: "Proper Case naming", "back to home button", "no em-dashes") and the **Session C** calendar notes (legend + event-label format, ICS title format).
5. **This is a polish PRD, not an architecture PRD.** Four independent quick wins, all suitable for a single session/branch. No DB changes, no new dependencies, no new routes. The data each item needs is already loaded.

## Goal

Land the small, non-architectural UI/copy fixes the family flagged during the testing pass, without disturbing the design system. Four items:

1. **Title Case** the readable, human-facing labels (nav, page titles, button labels) per an explicit family decision — while preserving the intentional all-caps `Eyebrow` device and sentence-case body copy.
2. **Scrub em-dashes (—)** from user-facing rendered copy, replacing each with a comma, period, colon, or parentheses as reads best.
3. **Make "go home" discoverable** — the wordmark already links to `/`; ensure it reads as clickable and/or add an explicit Home nav entry.
4. **Calendar display polish** — richer event labels on `/calendar` ("Property · Person (N guests)"), a property→color legend (already present; verify/refine), and a unified ICS event title format "[PROPERTY] | [PERSON]".

## In scope

### Item 1 — Title Case site-wide (explicit family decision)

The family asked for **Title Case** (Capitalize Each Major Word) on the **readable** chrome: navigation/menu labels, page `<h1>` / `PageIntro` titles, and button labels. The tension to manage: the design system intentionally uses **all-caps letter-spaced eyebrows** and **sentence-case titles**. The decision (see Pre-flight) is to **Title-Case the readable titles/nav/buttons and leave the `Eyebrow` device untouched** (it's already uppercase styling, so re-casing its source string is invisible and risks double-styling oddities).

**Precisely what becomes Title Case:**

- **Nav / menu labels** — the `label` strings in `NAV_GROUPS` (group labels and link labels) in [site-nav.tsx](../src/components/app-shell/site-nav.tsx). Today: group `"Family"`, `"Operations"`; links `"Directory"`, `"Properties"`, `"Calendar"` — all happen to already be single capitalized words, so most are no-ops. The rule still applies: any multi-word nav label uses Title Case. Also the `description` sub-labels stay **sentence case** (they're descriptive body copy, not labels) — leave them.
- **Page titles** — the `title` prop passed to `PageIntro` and any bare page `<h1>`/`<h2>` Fraunces headings. Examples to fix: `/calendar` `title="All properties"` → **"All Properties"** ([calendar/page.tsx](../src/app/(app)/calendar/page.tsx) line ~99), and the `<h2>` `"Upcoming"` is fine (single word). Sweep every `PageIntro title={…}` across `src/app/(app)/**` and Title-Case multi-word titles.
- **Button labels** — the visible text inside `<Button>…</Button>` (and `<SheetTitle>`, primary-action buttons) across `src/app/(app)/**`. Known multi-word examples to convert: "Add a contact" → **"Add a Contact"**, "Add a property" → **"Add a Property"**, "Add a property admin" → **"Add a Property Admin"**, "Edit details" → **"Edit Details"**, "Invite a family member" → **"Invite a Family Member"**, "Request these dates" → **"Request These Dates"**, "Back to property" → **"Back to Property"**, "Subscribe to your bookings" → **"Subscribe to Your Bookings"**. (Inventory live — grep, don't trust this list to be exhaustive.)

**What stays as-is (do NOT re-case):**

- **`Eyebrow` / `eyebrow`-classed labels** — [eyebrow.tsx](../src/components/shell/eyebrow.tsx), the `eyebrow` class in [globals.css](../src/app/globals.css), and the inline `eyebrow`-classed `<span>`s in [site-nav.tsx](../src/components/app-shell/site-nav.tsx) (the group rail labels) and the `eyebrow` prop on `PageIntro`. They render uppercase via CSS; leave their source strings.
- **Section rules / metadata eyebrows** — [section-rule.tsx](../src/components/shell/section-rule.tsx), [stat-line.tsx](../src/components/shell/stat-line.tsx) labels that use the eyebrow styling.
- **Body copy / descriptions / context lines** — `PageIntro` `context`, nav `description`, paragraphs, hints, empty-states. These stay **sentence case**.
- **Proper nouns and place names** already cased (e.g. "Boone, North Carolina").

**Title Case style rule** (apply consistently): capitalize the first word, the last word, and all major words; keep minor words lowercase **unless first/last** — articles (a, an, the), short coordinating conjunctions (and, but, or, nor), and short prepositions (to, of, in, on, for, with, at, by). So "Add a Property" (a stays lowercase), "Back to Property" (to stays lowercase), "Subscribe to Your Bookings" (to lowercase, Your capitalized).

**Files to touch:** [site-nav.tsx](../src/components/app-shell/site-nav.tsx) (`NAV_GROUPS` labels), [site-header.tsx](../src/components/app-shell/site-header.tsx) (the "Mathieson"/"Family" wordmark is fine — "Family" is eyebrow-styled, leave it), and button/`PageIntro`-title strings across `src/app/(app)/**` (notably `properties/`, `family/`, `admin/`, `calendar/`, `coming-soon/`). This is a manual, taste-checked pass — no global regex re-casing (it would mangle proper nouns and eyebrows).

### Item 2 — Em-dash scrub from UI copy

Remove em-dashes (—) from **user-facing rendered strings**, replacing each with a comma, period, colon, or parentheses as reads best. This is a **careful, reviewer-checked copy pass with taste** — not a blind find-replace.

**Scope:**
- **IN**: rendered JSX text in `src/app/**` and `src/components/**` — the strings a family member actually sees on screen.
- **OUT**: code comments (many `—` hits are in `//`-comments and JSDoc — leave them), and **everything under `prds/` and `docs/`** (those are internal docs and use em-dashes freely).

**How to find candidates (then judge each by hand):**

```
# rendered-string suspects across app + components (excludes comments by eye):
grep -rn '—' src/app src/components --include="*.tsx"
```

Known user-facing instances to review (non-exhaustive — the grep is the source of truth): the `"No photo yet — drop one in below"` empty-state, em-dashed `context`/blurb lines on [calendar/page.tsx](../src/app/(app)/calendar/page.tsx), the `"—"` fallbacks for missing names (these single-glyph placeholders are a **separate question** — see Pre-flight; default: leave the `"—"` em-dash *placeholders* since they're a typographic stand-in, not prose). The ICS `feedTitle` strings in [route.ts](../src/app/api/ics/[scope]/route.ts) (`"Mathieson Family — My bookings"` etc.) render in users' calendar apps and **are** user-facing — Item 4 already rewrites the per-event titles; for the feed/calendar *name* strings, replace the `—` with a colon: "Mathieson Family: My Bookings".

**Replacement guidance:**
- Dash joining two independent clauses → period or semicolon. ("Apps refresh every few hours — new bookings aren't instant." → "Apps refresh every few hours, so new bookings aren't instant.")
- Dash introducing a list/elaboration → colon. ("No photo yet — drop one in below" → "No photo yet. Drop one in below" or "No photo yet: drop one in below".)
- Parenthetical aside → wrap in commas or parentheses.
- Title/label separators ("Family — My bookings") → colon.

Mark this **reviewer-checked**: the executing session should list every changed string in the Implementation section so a human can read the new copy.

### Item 3 — Home affordance (discoverability)

**Not a missing link.** The "Mathieson Family" wordmark in [site-header.tsx](../src/components/app-shell/site-header.tsx) is **already** a `<Link href="/">` with a `hover:opacity-80` transition (lines 21–31). The Gap-log row ("a back to home button" → "Click the mathieson family to go back home") is a **discoverability** ask: the tester didn't realize it was clickable. Severity: low.

**Chosen approach (light touch):**
- **Primary:** add an explicit **"Home"** entry so there's an obvious, labeled way back. Add a `{ label: "Home", href: "/" }` link to `NAV_GROUPS` in [site-nav.tsx](../src/components/app-shell/site-nav.tsx). Placement decision in Pre-flight (recommend: a small standalone link before the "Family" group, or as the first link in the Family group). The existing `isActive` helper already special-cases `href === "/"` for exact-match highlighting, so the active state works out of the box.
- **Secondary (cheap, do it anyway):** make the wordmark *read* as clickable — add `cursor-pointer` and a slightly stronger hover cue (e.g. keep `hover:opacity-80`; optionally add `hover:text-foreground` on the "Family" sub-label) so the affordance is felt, not just present.

Do **not** add a heavy breadcrumb system or a separate "Back to Home" button on every page — that's over-engineering a low-severity nit.

### Item 4 — Calendar display polish (from Session C)

Two surfaces. The data is already loaded in both; this is presentation only.

**4a — Unified `/calendar` band labels + legend** ([calendar/page.tsx](../src/app/(app)/calendar/page.tsx), bands consumed by [month-calendar.tsx](../src/app/(app)/properties/[slug]/calendar/_components/month-calendar.tsx)):

- **Legend** — a property→color legend **already exists** on the page (the `LedgerPanel` with `<Eyebrow>Legend</Eyebrow>`, lines ~103–125, mapping `propertyTone` swatches to property names). **Verify it renders and reads well**; refine spacing/wording if needed, but it likely needs no functional change. Note this in Implementation so the reviewer knows it was checked, not skipped.
- **Band label** — today the band `label` is just the property name: `label: propertyName.get(b.property_id) ?? "—"` (line ~91). Change it to **"Property · Person (N guests)"**. The booking rows already join `profiles (full_name, email)`; add `guest_count` to the `select` (currently the unified query selects `id, property_id, start_date, end_date, status, profiles…` — it does **not** yet select `guest_count`, so **add `guest_count` to the `.select(...)` and to the `BookingRow` type**). Build the label like:
  - `const person = b.profiles?.full_name ?? b.profiles?.email ?? "—";`
  - `const name = propertyName.get(b.property_id) ?? "—";`
  - `label: \`${name} · ${person} (${b.guest_count} guest${b.guest_count === 1 ? "" : "s"})\``
  - The band is rendered truncated in the day cell with `title={b.label}` (full text on hover) — see [month-calendar.tsx](../src/app/(app)/properties/[slug]/calendar/_components/month-calendar.tsx) lines ~222–238 — so a long label degrades gracefully. No change needed to `month-calendar.tsx`; `CalendarBand.label`/`.tone` already carry this.
  - Use the middot `·` (U+00B7), not an em-dash, as the separator (consistent with Item 2 and the existing "Upcoming" list which already uses `·`).

**4b — ICS event title format** ([route.ts](../src/app/api/ics/[scope]/route.ts)):

- Today the per-event `title` is `scope === "me" ? b.propertyName : b.guestName` (line ~178) — inconsistent across scopes. **Unify to "[PROPERTY] | [PERSON]"** for every scope: `title: \`${b.propertyName} | ${b.guestName}\``. Both fields already exist on the normalized `FeedBooking` (`propertyName`, `guestName`) for both the token path (`loadByToken`) and the cookie path (`loadByCookie`), so no query change is needed.
- The literal pipe `|` is valid in an ICS SUMMARY (the `ics` library escapes as needed); keep it per the family's requested format from the playbook ("[PROPERTY] | [PERSON BOOKING]").
- Separately, the **feed/calendar name** strings in `feedTitle` use em-dashes ("Mathieson Family — My bookings"); per Item 2, swap those to a colon ("Mathieson Family: My Bookings") and Title-Case the readable tail per Item 1.

## Pre-flight decisions

| Decision | Recommendation | Why |
|---|---|---|
| **Does the all-caps `Eyebrow` device get re-cased?** | **No — leave eyebrows as-is.** Title-Case only nav labels, page `<h1>`/`PageIntro` titles, and button labels. | Eyebrows render uppercase via the `eyebrow` CSS class; re-casing their source is invisible and risks fighting the design system. The five non-negotiables keep eyebrows + Fraunces as the luxury signal. |
| **Title Case style** | Chicago-ish: capitalize first/last + all major words; keep articles, short conjunctions, and short prepositions (a, an, the, and, or, to, of, in, on, for, with, by, at) lowercase unless first/last. | Predictable, reads as "premium editorial," matches the family's "Capitalize Each Major Word" ask without ALL-CAPS-ing connectors. |
| **Sentence-case body copy** | Leave `PageIntro` `context`, nav `description`s, paragraphs, hints, empty states in sentence case. | Title Case is for *labels/titles*, not prose. Sentence case stays the body voice. |
| **Em-dash replacement style** | Per-string by hand: clauses → period/semicolon; elaboration/list → colon; aside → commas/parentheses; label separators → colon. Reviewer-checked. | "Careful copy pass with taste," not a regex. Reviewer reads the new copy. |
| **The `"—"` name *placeholders*** (e.g. missing full_name fallback) | Leave them (or optionally switch to "Unknown"/"—" en-dash); they're typographic stand-ins, not prose. Don't let the em-dash scrub blank out a fallback to an empty string. | Replacing a placeholder glyph with nothing would break the fallback. Out of the spirit of the copy scrub. |
| **Home affordance approach** | Add an explicit **"Home"** nav entry (`href="/"`) **and** keep/strengthen the clickable wordmark (cursor-pointer + hover). No breadcrumbs, no per-page back button. | Low-severity discoverability nit; an explicit labeled entry plus a felt hover is the proportionate fix. |
| **Home entry placement** | A standalone "Home" link rendered before the "Family" group (or first link in the Family group). Executor picks whichever reads cleaner in the existing rail layout. | Keeps the existing group structure; `isActive` already handles `/` exact-match. |
| **Calendar legend** | Already present — verify + refine only. | Avoid rebuilding shipped UI; confirm it reads well. |
| **Band-label separator** | Middot `·` (U+00B7), format `Property · Person (N guests)`. | Consistent with the existing "Upcoming" list and avoids reintroducing an em-dash. |
| **ICS title format** | `[PROPERTY] | [PERSON]` for **all** scopes (me/all/property). | The family's explicit requested format; unifies the current scope-dependent inconsistency. |

## Out of scope

- Any layout/architecture change, new route, new component, or new dependency.
- DB/schema/migration changes (Item 4 only *reads* an already-stored `guest_count`).
- The other Gap-log/testing-pass findings, which are their own PRDs: onboarding/"create your profile" flow and Family-Branch dropdown ([13 — Onboarding & Welcome](13-onboarding-welcome-help.md)), `/family` using profile photos instead of initials, large-image upload performance, booking-notification emails, guest permissions. **Do not** pull those in.
- Restyling the `Eyebrow` component or the `eyebrow` CSS class.
- A breadcrumb system or per-page "back" button.

## Likely file layout

```
# Item 1 — Title Case
src/components/app-shell/site-nav.tsx          # NAV_GROUPS labels (most already single-word)
src/app/(app)/calendar/page.tsx                # PageIntro title "All properties" → "All Properties"
src/app/(app)/**/*.tsx                         # <Button> labels, PageIntro title props, SheetTitle
                                               #   (properties/, family/, admin/, coming-soon/)

# Item 2 — Em-dash scrub (rendered strings only; NOT comments, NOT prds/ or docs/)
src/app/**/*.tsx
src/components/**/*.tsx
src/app/api/ics/[scope]/route.ts               # feedTitle strings (colon, not em-dash)

# Item 3 — Home affordance
src/components/app-shell/site-nav.tsx          # add { label: "Home", href: "/" }
src/components/app-shell/site-header.tsx        # cursor-pointer / hover cue on the wordmark

# Item 4 — Calendar polish
src/app/(app)/calendar/page.tsx                # add guest_count to select + BookingRow; build rich label; verify legend
src/app/api/ics/[scope]/route.ts               # unify event title to "[PROPERTY] | [PERSON]"
# (month-calendar.tsx needs NO change — it already renders CalendarBand.label with title= hover)
```

## Verification recipe

1. **Title Case sweep** — `grep -rn '<Button' src/app/(app) --include="*.tsx"` and eyeball every multi-word label is Title Case; load `/calendar` and confirm the title reads **"All Properties"**; open the mobile nav sheet and the desktop nav and confirm labels are Title Case while the small uppercase eyebrow rail labels ("Family", "Operations") are unchanged.
2. **Eyebrows untouched** — confirm eyebrow-styled labels still render ALL-CAPS letter-spaced (they should look identical to before).
3. **Em-dash scrub** — `grep -rn '—' src/app src/components --include="*.tsx"` returns only comment/code hits, no rendered-string hits (or document each intentional remaining `"—"` placeholder). Read each changed string aloud — it should read naturally.
4. **Home discoverability** — the nav shows a "Home" entry that routes to `/` and highlights as active on the dashboard; hovering the "Mathieson Family" wordmark shows a pointer cursor and a hover cue.
5. **Calendar band label** — load `/calendar`, hover a booking band, and confirm the title reads **"Property · Person (N guests)"** with correct singular/plural; confirm the legend swatches match the band colors.
6. **ICS title** — hit `/api/ics/me?token=…`, `/api/ics/all?token=…`, and a property-scope feed; confirm every `SUMMARY` is **"[Property Name] | [Person Name]"** and the `X-WR-CALNAME`/`calName` uses a colon, not an em-dash.
7. **Build gates** — `npx tsc --noEmit` clean, `eslint` clean on changed files, `npm run build` succeeds.

## Implementation

✅ Shipped. All four items landed in one session/branch. No DB, route, or dependency changes. Build gates green: `npx tsc --noEmit` clean, `eslint` clean on all changed files, `npm run build` succeeds.

### Item 1 — Title Case

**Rule applied** (Chicago-ish, per Pre-flight): capitalize first/last + major words; keep articles, short conjunctions, and short prepositions lowercase (a, an, the, and, or, to, of, in, on, for, with, by, at, as). Hyphenated compounds capitalize both elements ("Sign-In").

**Casing line that resolved the PRD's ambiguity:** the PRD's button inventory listed "Request these dates" and "Subscribe to your bookings" as buttons to Title-Case, but the live grep showed both are `<Eyebrow>` devices. The Pre-flight "leave eyebrows as-is" decision wins (re-casing them is invisible anyway — they render ALL-CAPS via CSS), so they were **left untouched**. Same for all other `<Eyebrow>`, `eyebrow`-classed, and `PageIntro eyebrow=` strings.

**Heading-vs-sentence rule (judgment call, applied consistently):** Title-Cased Fraunces heading *labels* (no terminal punctuation, function as titles) — e.g. "The Place", "Living Here", "What We Ask", "On the Ground", "Awaiting Your Call", "Your Stays", "Upcoming Approved Bookings". **Left** greeting/sentence headings that carry terminal punctuation and read conversationally — "Welcome back, {firstName}." and "Check your inbox." (consistent with treating them as body voice, not titles).

**Form field labels left as-is** (`<Field label=…>`, `<Label>`, `<select>` `<option>` values) — out of the PRD's explicit scope (nav / page titles / buttons) and sentence-case form labels are a valid internal style.

Changed strings (titles/headings): `calendar` "All Properties"; `profile/edit` "What the Family Sees"; `admin` "Pending Bookings"; `properties/[slug]` "The Place" / "Living Here" / "What We Ask" / "On the Ground"; `properties/[slug]/calendar` "Awaiting Your Call" / "Your Stays" / "Upcoming Approved Bookings"; `family` GENERATION_LABEL "First Generation"…"Fifth Generation" + "Generation Not Set"; dashboard + coming-soon data titles "Family Timeline", "Trust Documents & AI", "Family Messaging".

Changed strings (buttons / menu / CTA links): "Edit Details", "Save Changes" (×2), "Manage Your Photos →", "Create Property", "Create Invitation", "Email Magic Link", "Add Contact", "Cancel Booking", "Use as My Avatar", "Add Amenity", "Add Peak Period", "Submit Request", "Back to Property", "Reset Link", "Reset My Calendar Link", "Add Photos" (×2), "From Device", "Open Picker", "Reopen Picker", "Try the Failed Ones Again", "Try Again", "View My Profile", "Edit Profile", "Sign Out", "Send Sign-In Link", "Add Photo" (PhotoUpload default), "Bulleted List" / "Numbered List" (rich-text toolbar tooltips). Single-word labels (Save, Delete, Remove, Add, Cancel, Approve, Decline, Revoke, Copy, Write, Preview, Admin, Calendar, Continue with Google, Apple / Outlook) were already correct.

### Item 2 — Em-dash scrub (reviewer-checked)

Per-string by hand: clauses → period/semicolon; elaboration/list → colon; aside → commas. **Comments and `prds/`/`docs/` left untouched.** Scope extended beyond the `.tsx` grep to two user-facing error strings in `.ts` action files (they surface via `alert()`/`state.message`).

Every changed user-facing string:
- `page.tsx` (dashboard): "Family-shared places: house rules…"; "Stories, milestones, history. Preserved."; "A quiet place for the family, to share…"; "…what each one will do and why, and tell us…"
- `calendar/page.tsx`: subscribe blurb "…every few hours, so new bookings aren't instant."
- `properties/[slug]/page.tsx`: empty-state "No photo yet. Drop one in below" (eyebrow-styled but prose — em-dash scrubbed, source casing left)
- `properties/[slug]/calendar/page.tsx`: subscribe blurb "…every few hours, so new bookings aren't instant."
- `booking-request-form.tsx`: "…peak window, so the request will sit pending…"; "Approved. These dates are yours."; "Submitted. A property admin will review."
- `coming-soon/[feature]/page.tsx`: description "…cited answers without paging a lawyer…"; rationale "…before anything goes online: how they're encrypted…"; rationale "…day-to-day; otherwise it's an empty room."; footer "Let us know. The family's priorities…"; "← Back to Dashboard"
- `admin/page.tsx`: section description "…each property's calendar. Links below open the request in context."
- `property-edit-form.tsx`: hint "Add what the place has, one per chip."
- `subscribe-to-calendar.tsx`: default blurb "…every few hours, so new bookings aren't instant."; "Treat it like a password. Anyone with the link…"
- `markdown.tsx`: emptyHint "Nothing here yet. Edit to add details."
- `rich-text-field.tsx`: preview emptyHint "Nothing to preview yet. Switch to Write and add some content."
- `google-photos-picker.tsx`: oversize msg "…even after downsize. Skipped."; "…couldn't be saved. Last error: …"; "Per-pick consent: we never read your wider library."
- `photo-gallery.tsx`: "No photos yet. Be the first to add one above."
- `admin/actions.ts`: thrown "Cannot send: invitation is {status}"
- `properties/[slug]/calendar/actions.ts`: "Another approved booking now conflicts with these dates. Refresh the queue."
- `api/ics/[scope]/route.ts`: feed names → colon (see Item 4)

**Intentionally left:** the `?? "—"` / `|| "—"` missing-name **placeholder glyphs** (calendar, family, admin, property calendar) — typographic stand-ins, not prose, per Pre-flight; blanking them would break the fallback. Also left the technical error-format em-dash in `src/lib/google/photos-picker.ts` (diagnostic string, not UI copy).

### Item 3 — Home affordance

- Added a standalone **"Home"** link (`href="/"`) before the nav groups in **both** `SiteNavDesktop` and `SiteNavMobile` (`site-nav.tsx`). `isActive` already exact-matches `/`, so active highlighting on the dashboard works with no extra logic. Chose a standalone link over "first link in Family group" — semantically cleaner than nesting Home under the Family rail.
- `site-header.tsx`: wordmark link gets `cursor-pointer`, `group` + `group-hover:text-foreground-muted` on the "Family" sub-label, and `aria-label="Home"` so the affordance is felt and labeled. No breadcrumbs / per-page back button (out of scope).

### Item 4 — Calendar display polish

- **4a band label** (`calendar/page.tsx`): added `guest_count` to the unified `bookings.select(...)` and to the `BookingRow` type; band label is now `` `${name} · ${person} (${n} guest[s])` `` using the middot separator and correct singular/plural. `guest_count` is `NOT NULL DEFAULT 1` in schema, so no null-guard needed. `month-calendar.tsx` unchanged — it already renders `CalendarBand.label` truncated with `title=` hover.
- **Legend** (`calendar/page.tsx`): **verified, not changed.** The existing `LedgerPanel` + `<Eyebrow>Legend</Eyebrow>` maps `propertyTone` swatches to property-name links; bands use the same `propertyTone` map, so swatch colors and band colors stay in sync by construction. Reads well; no functional change needed.
- **4b ICS title** (`api/ics/[scope]/route.ts`): unified the per-event SUMMARY to `` `${b.propertyName} | ${b.guestName}` `` for **all** scopes (was `propertyName` for "me", `guestName` otherwise). Feed/calendar names switched em-dash → colon and Title-Cased: "Mathieson Family: My Bookings", "Mathieson Family: All Properties", "Mathieson Family: {name}".

### Follow-ups / notes for downstream sessions

- **PRD 13 (Onboarding) & 14 (Notifications)** also touch nav/copy and the ICS/email surfaces — the Title-Case convention and the `[Property] | [Person]` ICS format are now the established patterns; match them.
- The heading-vs-sentence and form-field-label decisions above are conventions, not one-offs — apply them to any new chrome so casing stays consistent.
