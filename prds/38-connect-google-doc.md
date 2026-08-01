# 38 — Connect Google Doc (Read the Manual Where It Lives)

**Phase**: 7 (authoring assist) · **Depends on**: 37 (the paste pipeline is the engine), 05 (Google identity layer: `requestAccessToken` + `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID`)
**Status**: 🚧 built 2026-08-01 (branch `prd-38-google-doc`) — **blocked on an owner console change before it can be walked or seen**; see §Implementation
**Parallel-safe with**: most feature PRDs (touches the intake band, one new capture component, `src/lib/google/`).

---

## Why this exists

Dan's ask after walking PRD 37: *"a button callout to Connect Google Doc, to read directly from a google doc."* The family's house manual lives in Google Docs — that's where Dad wrote it, and where the next family's manual will live too. PRD 37 made "paste it" work; this removes the copy-paste step entirely. Pick the doc, and its text flows into the exact same sort-and-review pipeline.

This is deliberately a thin door onto PRD 37's engine, not a new pipeline: the Google Doc's plain-text export IS a paste. Everything downstream — credential catch, contacts with kinds, Wi-Fi card, tidied prose, provenance `.txt`, retention — is already built and already walked on the real document.

## Goal

The "Rather not type it?" band gains a fourth door and a new hierarchy (Dan's spec): **Connect Google Doc** is the filled primary button, followed by outline **Add from a Photo**, **Paste Text**, **Add by Voice**. Clicking it opens Google's picker, the member chooses a doc, and lands directly on the PRD 37 review with the doc sorted.

## What already exists (don't rebuild)

| Piece | State |
|---|---|
| Per-pick Google consent | `src/lib/google/identity.ts` — `requestAccessToken({ scope })`, token stays client-side, `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` gating. Built for the Photos Picker (PRD 05); the pattern is per-pick, no stored tokens, no refresh tokens. |
| Picker precedent | `src/components/google-photos-picker.tsx` + `src/lib/google/photos-picker.ts` — loads Google's picker script, scoped token, member picks, client fetches content |
| The whole engine | `extractPaste(propertyId, text)` — caps, store-`.txt`-before-model, fenced extraction, `parsePasteExtraction` credential redaction, `PasteReview` (Wi-Fi card, bulk contact checklist, narrative trims), PRD 33 retention |
| Band | `add-details-band.tsx` — currently three buttons, "Add from a Photo" filled |

## Pre-flight decisions

| Decision | Recommendation | Why |
|---|---|---|
| **Scope** | `https://www.googleapis.com/auth/drive.file` with the Google Picker. With `drive.file`, the picker itself grants access to exactly the file the member chooses — the app can never see the rest of their Drive. | The narrowest scope that works, and the same per-pick consent posture as PRD 05. Do NOT use `drive.readonly`. |
| **Getting the text** | Client-side `files.export` (`mimeType=text/plain`) with the picker token, then hand the string to the existing `extractPaste` server action. The token never reaches the server. | The server needs the *text*, not Google access. Keeping OAuth entirely client-side means no token storage, no refresh flow, no new secret. |
| **Which files** | Google Docs only in the picker view (`application/vnd.google-apps.document`). Not Sheets, not Slides, not arbitrary Drive files. | "Read my house manual" is the use case. Every added type is a new export format and a new failure mode. |
| **Size** | Same `MAX_PASTE_CHARS` (24k) cap, checked client-side after export with the same friendly over-cap message. | One engine, one set of limits. |
| **Provenance** | Unchanged: the exported text is stored as the `.txt` via `extractPaste`, `intent = 'paste'`. The retention row reads "Pasted document". | The stored artifact IS the text we read; where it came from is incidental. A source hint ("from Google Docs") is a nice-to-have label change, not a schema change. |
| **Band hierarchy** | Connect Google Doc = `Button` default (filled); Photo / Paste Text / Voice = outline. Order per Dan: Google Doc, Photo, Paste Text, Voice. Button renders **only when** `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` is configured (same gating idiom as the Photos picker); without it the band keeps today's three buttons with Photo filled. | Dan's explicit spec. No dead buttons: unconfigured envs never show a door that can't open. |
| **Where the flow lives** | A `mode=gdoc` entry on the intake page that immediately runs picker → export → `extractPaste` → the existing `PasteReview`, with a small "Reading your document…" interstitial. Also a card on the chooser, consistent with every other door. | The review is the destination; the picker is just a fancier way of filling the textarea. |
| **Errors** | Picker dismissed → back to chooser silently. Export fails / not a Doc / over cap → the paste capture screen opens with the error shown and the member can paste by hand instead. | Fallback is the sibling door, not a dead end. |

## In scope

- `src/lib/google/docs-picker.ts` — `DOCS_PICKER_SCOPE`, picker builder (Docs-only view), `exportDocText(fileId, token)` via `files.export`.
- Capture component: picker launch + interstitial + error fallback into `PasteCapture`.
- `add-details-band.tsx`: four buttons, new hierarchy, env-gated; chooser card ("A Google Doc you already have" or similar, sentence-case body, Title Case button).
- Google Cloud console change (owner action, like PRD 05's): enable the Drive API on the existing OAuth client and add the `drive.file` scope to the consent screen. Document in the PRD's Implementation section.
- Eval: none needed (no new model surface). The existing paste eval covers the engine; this PRD's tests are the picker/export seam, verified live.

## Out of scope

- Storing tokens, refresh tokens, or any standing Google connection ("Connected accounts" is a different, bigger feature).
- Live sync / re-import / change detection on the doc. One read per pick, like one photo per upload.
- Sheets, Slides, PDFs-in-Drive, folders.
- Any change to intents, parsers, caps, or the review surface.

## Verification recipe

1. **Happy path** — pick the real house-manual doc → consent screen shows the file-scoped grant → "Reading your document…" → PasteReview with the same proposals a manual paste produces; save one thing; retention row appears and deletes normally.
2. **Scope check** — the OAuth consent screen requests `drive.file` only; the token in the network tab never hits any host but Google's; nothing token-shaped in server logs.
3. **Fallbacks** — dismiss the picker (silent return); pick during an expired-script state (error → paste screen); a doc over 24k chars (friendly cap message → paste screen).
4. **Gating** — with the env var absent, the band shows three buttons with Photo filled (today's layout exactly); no Google script loads anywhere.
5. **Guest** — unchanged (band absent for guests; `extractPaste` rejects them regardless).
6. `tsc` / `eslint` / `build` green.

## Likely file layout

```
src/lib/google/docs-picker.ts                       # scope, picker view, export fetch
src/app/(app)/properties/[slug]/edit/intake/gdoc-capture.tsx   # picker launch + interstitial + fallback
src/app/(app)/properties/[slug]/edit/intake/intake-flow.tsx    # gdoc mode + chooser card
src/app/(app)/properties/[slug]/edit/add-details-band.tsx      # four doors, new hierarchy
```

No migration. No new env var (reuses `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID`); one console change on the existing OAuth client (owner action).

## Reviewer sign-off (I check these)

- [ ] `drive.file` scope only; token client-side only; picker-granted file access (the app can never list Drive).
- [ ] The doc text enters through `extractPaste` unchanged — same caps, same fencing, same credential redaction, same review; no new server surface.
- [ ] Band: four doors in Dan's order with Connect Google Doc filled; env-gated so unconfigured envs keep today's band; no dead buttons.
- [ ] Fallbacks land on the paste screen, never a dead end; picker dismissal is silent.
- [ ] Copy: Title Case buttons, sentence-case body, no em-dashes.
- [ ] Live walk: the real Google Doc picked and sorted on prod, consent screen inspected, network tab checked for token hygiene.

---

## Implementation (built 2026-08-01, branch `prd-38-google-doc`)

Status: 🚧 built, **not yet walked live**. The owner console change below is a hard prerequisite: until it is done the door correctly renders nowhere, so nothing can be verified on prod.

### Key files

| File | What it does |
|---|---|
| `src/lib/google/docs-picker.ts` | `DOCS_PICKER_SCOPE`, Docs-only picker view, `pickGoogleDoc`, `exportDocText`, `connectGoogleDoc`, `isDocsPickerConfigured` |
| `.../edit/intake/gdoc-capture.tsx` | The screen: one press, consent, picker, interstitial, failure handoff |
| `.../edit/intake/intake-flow.tsx` | `gdoc` phase + `?mode=gdoc`, chooser card, over-cap handoff |
| `.../edit/intake/paste-capture.tsx` | New optional `initialText` so a handed-back document arrives in the box |
| `.../edit/add-details-band.tsx` | Four doors, Google Doc filled, env-gated |
| `next.config.ts` | CSP: three Google hosts the picker needs |
| `evals/gdoc/picker-seam-check.mts` | 8 checks: the scope, the mime, the CSP hosts (no browser, no cost) |

### Three places the pre-flight was wrong

1. **"No new env var" was incorrect.** A `drive.file` Google Picker requires two more public values that the Photos Picker did not: `setDeveloperKey` (a browser API key) and `setAppId` (the **Cloud project number**, which is how Google ties picker-granted `drive.file` access back to this app). Neither is a secret and both ship in the browser bundle, but neither is optional; there is no supported way to run this picker without them. Added as `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` and `NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER`, documented in `.env.local.example`, and folded into `isDocsPickerConfigured()` so the door renders only when all three are present.
2. **The CSP would have blocked it.** PRD 28's policy is tight and named only `accounts.google.com`. The picker also needs `apis.google.com` in `script-src` (gapi plus the Picker library), `www.googleapis.com` in `connect-src` (the text export), and `docs.google.com` in `frame-src` (the picker renders in its own iframe). This was invisible to `tsc` and to the build and would have surfaced as a live console error, so `picker-seam-check.mts` now guards all three.
3. **The picker cannot auto-launch on arrival.** The PRD's `mode=gdoc` entry was specified to run picker → export immediately. The consent screen is a popup, and browsers only allow popups from a user gesture; the click on the band is a link, and that gesture does not survive the navigation. So `?mode=gdoc` lands on a short screen whose one button opens Google. This also gives somewhere honest to say what Google is about to ask and what we can and cannot see.

### Decisions made during the build

- **Plain text, not HTML or Markdown.** The destination is `extractPaste`, which takes prose; formatting is exactly what that pipeline discards, and every markup character spends the 24k cap on angle brackets.
- **An over-cap document is handed back, not thrown away.** `PasteCapture` gained `initialText`, so a doc past `MAX_PASTE_CHARS` opens the paste box *with the document in it* next to the "try it in two or three parts" hint. Making the member fetch it from Google again to split it in half would be the errand this band exists to remove. The same text stays behind a successful import, so "start over" out of the review is also non-destructive.
- **Dismissal is silent, failure lands on the sibling door.** Closing the picker returns to the button. Any Google-side failure goes to the paste screen with the reason and whatever text was recovered, per the PRD's "fallback is the sibling door, not a dead end".
- **Docs-only twice over.** The view is `ViewId.DOCUMENTS` *and* filtered to the Docs mime type, so neither a Google default nor a folder traversal can put a Sheet in the callback.
- **The load promise clears itself on failure.** A cached rejected promise would make "press it again" impossible until a full page reload, which is the obvious thing a member would try.
- **No server surface was added.** The text reaches `extractPaste(propertyId, text)` exactly as a paste does. No new action, no new intent, no parser change, no migration. The retention row still reads "Pasted document"; where the text came from is incidental to what was stored.

### Owner action still required (blocks the live walk)

In the Google Cloud console, on the **existing** OAuth client's project:

1. Enable the **Google Picker API** and the **Google Drive API**.
2. Add `https://www.googleapis.com/auth/drive.file` to the OAuth consent screen's scopes.
3. Create a **browser API key**, restricted by HTTP referrer to the site's origins → `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY`.
4. Copy the **project number** (console → Home → Project info) → `NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER`.
5. Set both in Vercel (and `.env.local` for local work).

Until step 5, `isDocsPickerConfigured()` is false everywhere and the band is exactly today's three buttons with Photo filled. That is the intended unconfigured state, and it is what the current prod deploy will show.

### Verified so far

- `tsc`, `eslint`, `npm run build` green.
- `evals/gdoc/picker-seam-check.mts` 8/8, including a negative control (removing `apis.google.com` from the CSP fails the check as it should).
- `evals/intake/paste-parser-check.mts` 40/40 and `evals/wifi/qr-payload-check.mts` 19/19 still green: the engine underneath is untouched.
- **Not** verified: everything in the Verification recipe above, all of which needs the console change first.

### Follow-ups

- The chooser's intro copy still says "Photograph it, or just say it out loud" and does not mention the Google door. Left alone rather than made conditional on an env var mid-sentence; worth a pass if a fifth door ever appears.
- One doc per pick, by design. If the manual is split across several docs, that is several presses.
