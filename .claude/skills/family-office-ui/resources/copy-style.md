# Copy style

## Voice
The voice should be calm, specific, discreet, and useful.
It should sound like a well-run family office with warmth, not like a marketing site.

## Principles
- Prefer specificity over abstraction.
- Prefer calm direct labels over hype.
- Keep headings short.
- Use subheads to orient, not sell.
- Write like the reader already belongs here.

## Good patterns
- Recent family notes
- Spring maintenance items
- Trust summary
- Homes and properties
- Upcoming decisions
- Shared documents
- Advisors and contacts
- Gallery highlights
- Family directory

## Avoid
- Empowering your family journey
- All-in-one family solution
- Unlock seamless collaboration
- Modernize your legacy
- Effortless trust management platform

## Microcopy rules
- Buttons should be literal **and Title Case**: View Property, Open Gallery, Review Summary, Add Note
- Empty states should feel composed and stay **sentence case**: No recent advisory notes, No active property issues
- Metadata should be elegant and compact: Updated 2 days ago, 14 documents, 3 upcoming items

## Casing & punctuation (explicit family decision — apply everywhere, every session)

The family asked for **Title Case on the readable chrome** and **no em-dashes** in anything they read. These are not stylistic suggestions; they are standing conventions. A new page or email must not reintroduce sentence-case buttons or em-dashes.

### Title Case
Capitalize the first word, the last word, and all major words. Keep **minor words lowercase** unless first/last: articles (a, an, the), short coordinating conjunctions (and, but, or, nor), and short prepositions (to, of, in, on, for, with, by, at, as). Capitalize **both halves of a hyphenated compound** (Sign-In). Examples: "Add a Property", "Back to Property", "Subscribe to Your Bookings", "View on the Calendar".

Apply Title Case to:
- **Nav / menu labels** — including user-dropdown items (View My Profile, Sign Out, How This Works).
- **Page titles** — `PageIntro title`, and bare `<h1>`/`<h2>` Fraunces headings that read as *titles* (The Place, Awaiting Your Call, Your Properties).
- **Button & CTA labels** — `<Button>` text, `SheetTitle`, button-like CTA links (Manage Your Photos →, Read the Quick Guide), and the `triggerLabel` / `submitLabel` / `addLabel` props (Add Photos, Add Another Photo, Add Amenity).
- **Email CTA buttons** — Review Request, View on the Calendar, Find Open Dates.

### Leave as-is — do NOT re-case the source
These render uppercase via CSS, so re-casing the source string is invisible and risks fighting the design system:
- The **`Eyebrow`** component, the `eyebrow` CSS class, and the `PageIntro eyebrow` prop.
- **`SectionRule`** labels, **`StatLine`** labels, and the email masthead ("Mathieson Family").

### Stays sentence case (do NOT Title-Case)
- Body copy, paragraphs, `PageIntro context`, nav `description` sub-labels, hints, empty states.
- **Form field labels** (`<Field label>`, `<Label>`) — sentence case is the intentional form voice (Your name, Max guests, Peak periods).
- **Headings that read as sentences** — a heading with terminal punctuation or a conversational clause stays sentence case: "Welcome back, {name}.", "Check your inbox.", "A quiet place for the family.", "Let's set up your profile."
- **Email subjects and headings** — keep these calm and editorial, *not* Title Case (Title-cased subjects read as marketing/spam): "Your Loon House booking is confirmed", "New booking request: {property}".

### No em-dashes (—) in user-facing copy
Replace every em-dash by hand, choosing by sense (this is a taste pass, never a blind find-replace):
- Two independent clauses → period or semicolon.
- Elaboration or a list → colon.
- Parenthetical aside → wrap in commas or parentheses.
- Title / label / subject separator → colon.

In scope: rendered JSX in `src/app` + `src/components`, user-facing strings in `.ts` (server-action errors / `state.message`, email templates), and the `/help` markdown (`help-content.ts`). **Out of scope:** code comments, `prds/` and `docs/`, and the **`"—"` placeholder glyph** for a missing value (`?? "—"`, `|| "—"`) — that's a typographic stand-in, not prose; blanking it would break the fallback.

### Stable formats
- Inline separator: middot `·` (U+00B7), never an em-dash — e.g. `Property · Person (N guests)`.
- Calendar / ICS event title: `[Property] | [Person]` (all scopes). ICS feed name: `Mathieson Family: <scope>` (colon, Title-Cased tail).

### Verify before shipping a UI/copy change
```
grep -rn '—' src/app src/components --include="*.tsx" --include="*.ts"   # only comments + "—" placeholders should remain
grep -rnE '>\s*[A-Z][a-z]+ [a-z]' src/app src/components --include="*.tsx" # eyeball multi-word labels for stray sentence case
```
