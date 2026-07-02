# 29 — Older-User Readability & Touch Targets

**Phase**: 6 (usability) · **Depends on**: the shell/token system (globals.css, ui primitives)
**Status**: 🔍 in review — built + live-verified 2026-07-02, [PR #30](https://github.com/dm4th/family-website/pull/30).
**Parallel-safe with**: 25, 26, 27, 28, 30, 31. It **owns** `globals.css` + `components/ui/button.tsx` + `components/ui/input.tsx`; other PRDs consume those primitives without editing them, so no conflict. (If 30/31 also nudge a primitive, coordinate — but they shouldn't need to.)

---

## Why this exists

The primary audience is family members in their 60s+ on iPads and phones, and the type/control scale is tuned smaller than that audience needs. Measured **live** on 2026-07-01:

- The booking instruction "Tap your arrival day, then tap your last night" renders at **12px** ([month-calendar.tsx:280](../src/components/month-calendar.tsx), `text-xs`).
- Booking form labels ARRIVE / LAST NIGHT / GUEST COUNT / NOTES render at **~10.4px** uppercase ([booking-request-form.tsx:186,206,242,264](../src/components/booking-request-form.tsx), `text-[0.65rem]`).
- Body default is **14px**; `globals.css` sets font-family/smoothing but never bumps the base size.
- Buttons default to `h-8` (32px), `sm` to `h-7` (28px) ([ui/button.tsx:24](../src/components/ui/button.tsx)); inputs `h-8` ([ui/input.tsx:11](../src/components/ui/input.tsx)); chip-remove ✕ targets `size-5` = 20px ([people-picker.tsx:149](../src/components/authoring/people-picker.tsx), [chip-list-field.tsx:98](../src/components/authoring/chip-list-field.tsx)).

The team clearly *knows* the audience — calendar day cells are a comfortable `min-h-20`. The general control scale just doesn't match that instinct. **This is the single highest-leverage fix**: the smallest text on the page is the *instructional* text a confused person most needs to read.

## Goal

Body and instructional text are comfortably legible (≥16px body, nothing instructional below 14px), and primary interactive targets meet ~44px. Nothing regresses visually — the editorial restraint stays; it just breathes at a slightly larger scale.

## Pre-flight decisions

| Decision | Recommendation | Why |
|---|---|---|
| **Base size** | Set `html { font-size: 16px }` (or bump the body token) and audit that `rem`-based tokens scale sensibly. | Lifts the whole app at once; Tailwind sizes are rem-based so most things follow. |
| **Floor for instructional text** | Replace `text-xs` / `text-[0.65rem]` with `text-sm` (min) anywhere the text is an instruction, form label, or field hint — not decorative eyebrows. | Eyebrows/SECTION labels can stay small+uppercase (they're not read for comprehension); instructions can't. |
| **Control heights** | Raise button default to `h-10` (40px) / `sm` to `h-9`, inputs to `h-10`; raise chip-remove targets to ≥ `size-8` (with adequate hit area even if the glyph stays small). | 40px is the practical floor; 44px ideal. Keep the visual weight tasteful. |
| **Scope discipline** | Change the **primitives + tokens**, then sweep the handful of hardcoded `text-xs`/`text-[0.65rem]` instructional spots. Do NOT restyle every page. | Most of the app inherits from the primitives; only the hardcoded exceptions need touching. |
| **Contrast** | Nudge `--foreground-subtle` (L≈0.62, [globals.css:121](../src/app/globals.css)) darker for the hint/description text it's used on, OR stop using it at <14px. | It's marginal for older eyes at exactly the small sizes this audience needs. |

## In scope
- `globals.css`: base font-size bump; `--foreground-subtle` contrast nudge.
- `ui/button.tsx`, `ui/input.tsx`: default height increase.
- Chip-remove target size in `people-picker.tsx` / `chip-list-field.tsx`.
- Targeted sweep of hardcoded sub-`text-sm` **instructional** strings (booking form labels + instruction, welcome/profile field hints). Grep for `text-xs` and `text-[0.65rem]` and triage each: decorative-eyebrow → leave; instruction/label/hint → `text-sm`.

## Out of scope
- The aria-live / confirmation / silent-failure work — that's **PRD 30**.
- Copy wording / date formatting — that's **PRD 31**.
- Any layout redesign.

## Verification recipe (live, at 375px AND desktop)
1. **Booking page** — the two-tap instruction and ARRIVE/LAST NIGHT labels are comfortably readable (≥14px); measure with devtools/`getComputedStyle`.
2. **Buttons/inputs** — primary actions are ≥40px tall on mobile; thumb-tappable without zoom.
3. **Chips** — remove ✕ on a person/amenity chip is tappable without hitting the wrong thing.
4. **No regressions** — homepage doors, directory, archive, help all still look composed (not blown-up); eyebrows unchanged.
5. **Contrast** — hint text passes a quick contrast check at its rendered size.

## Likely file layout
```
src/app/globals.css                       # base font-size + foreground-subtle nudge
src/components/ui/button.tsx              # default/sm heights
src/components/ui/input.tsx               # height
src/components/authoring/people-picker.tsx, chip-list-field.tsx  # chip-remove target
src/components/month-calendar.tsx, booking-request-form.tsx      # instructional text sizes
```

## Implementation (2026-07-02)

**Approach**: rather than bumping the root `font-size` (already 16px — the "14px body" was really ~200 hardcoded `text-sm` usages), the Tailwind v4 type-scale tokens were remapped in `globals.css` `@theme`: `--text-xs` 12→13px, `--text-sm` 14→15px (with matching line-heights). One change lifts every `text-xs`/`text-sm` in the app; eyebrows and decorative micro-labels use arbitrary sizes (`text-[0.6875rem]` etc.) so they are untouched by design.

**Key files**
- [globals.css](../src/app/globals.css) — type-scale remap; `--foreground-subtle` darkened light-mode 0.62→0.55 oklch (measured 4.65:1 on ivory, was ~3.4:1) and brightened dark-mode 0.55→0.62 for parity.
- [ui/button.tsx](../src/components/ui/button.tsx) — default h-8→h-10 (40px), sm h-7→h-9 + `text-[0.8rem]`→`text-sm`, lg h-9→h-11 (44px), icon sizes up one step; `xs` left as a deliberate dense-UI escape hatch.
- [ui/input.tsx](../src/components/ui/input.tsx) — h-8→h-10.
- Booking: [month-calendar.tsx](../src/app/(app)/properties/[slug]/calendar/_components/month-calendar.tsx) (instruction + Start Over `text-xs`→`text-sm`, month-nav buttons h-10, weekday/band micro-text → `text-xs`=13px), [booking-request-form.tsx](../src/app/(app)/properties/[slug]/calendar/_components/booking-request-form.tsx) (the four ~10.4px uppercase labels → standard `Label` sentence-case 15px, matching the profile-form convention; hints → `text-sm`).
- Hints sweep: [welcome-flow.tsx](../src/app/welcome/welcome-flow.tsx), profile-edit/guest-profile forms, [photo-upload.tsx](../src/components/photo-upload.tsx), [google-photos-picker.tsx](../src/components/google-photos-picker.tsx), [contacts-editor.tsx](../src/app/(app)/properties/[slug]/edit/contacts-editor.tsx) label.
- Chips: [people-picker.tsx](../src/components/authoring/people-picker.tsx) + [chip-list-field.tsx](../src/components/authoring/chip-list-field.tsx) remove targets `size-5`→`size-8` (measured 32×32, chip 42px tall).
- Body ≥16px: [panel.tsx](../src/components/shell/panel.tsx) PanelDescription, [page-intro.tsx](../src/components/shell/page-intro.tsx) context, [activity-digest.tsx](../src/components/shell/activity-digest.tsx) titles, [markdown.tsx](../src/components/markdown.tsx) salon `prose-p`, help intro → `text-base` (their old `sm:text-[0.95rem]` overrides would have become *smaller* than the new `text-sm`).

**Live-verified** (prod-data dev server, logged in as Dan): tap instruction 15px; ARRIVE/LAST NIGHT/GUEST COUNT/NOTES 15px sentence case; date/guest inputs + submit + month-nav all 40px; lg buttons 44px; weekday header 13px; eyebrows 11px unchanged; two-tap selection → "4 nights · arrive Jul 8, depart Jul 12" at 15px; no horizontal overflow at ~325px; homepage/property/calendar composed in both themes. `tsc`, `eslint`, `next build` green.

**Decisions / follow-ups**
- Booking-form labels dropped the uppercase-tracking micro style entirely (PRD's "text-sm min" + copy-style sentence-case rule) instead of keeping uppercase at 15px, which read as heavy.
- Left small on purpose: admin table column headers, badges, status pills, nav section micro-labels, avatar initials, archive photo-count pill — decorative eyebrow class.
- Follow-up worth a future pass: a few decorative micro-labels sit at `text-[0.6rem]` (9.6px — below the 11px eyebrow standard): nav dropdown section labels, help-page area chips, admin-booking-row status. Not instructional, but inconsistent.
- The user-menu avatar button has an explicit `size-9` (36px) override — unchanged, pre-existing.

## Reviewer sign-off (I check these)
- [ ] Nothing instructional (label, hint, tap-instruction) renders below 14px — verified with `getComputedStyle` live, not by eyeballing source.
- [ ] Primary interactive targets ≥40px; chip-remove hit area enlarged.
- [ ] Eyebrows/SECTION micro-labels intentionally left small (not swept up by a blanket find/replace).
- [ ] No horizontal overflow introduced at 375px by the larger scale.
- [ ] The editorial look survives — spot-check homepage + a Family and an Operations page.
