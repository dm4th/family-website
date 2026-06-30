---
name: family-office-ui
description: Use when designing or refactoring the Mathieson family website UI, especially for premium layout, typography, component styling, dashboard shells, profiles, galleries, property views, trust/advisory pages, and overall front-end polish.
---

# Family Office UI

This skill steers Claude toward a visual system for Mathieson Family that feels like **private family office meets premium members club**.

Use this skill whenever a task touches:
- landing pages, dashboards, or home shells
- page-level or component-level UI/UX
- typography, color, spacing, interaction, imagery, or motion
- family profiles, photo galleries, property management, trust/advisory, archives, or shared documents
- refactoring a vanilla layout into a more premium and opinionated interface

Read these resources before making material UI changes:
- `resources/design-principles.md`
- `resources/component-system.md`
- `resources/page-recipes.md`
- `resources/copy-style.md`
- `resources/implementation-notes.md`

## Core stance

The site should not feel like a generic SaaS admin.
It should feel private, restrained, editorial, and multi-generational.
The user is managing family life and family infrastructure, not running a sales pipeline.

## Non-negotiables

1. Default to restraint.
- Use mostly neutral surfaces.
- Use one accent family at a time.
- Avoid loud gradients, glows, and neon treatments.

2. Create clear emotional zoning.
- Family life areas: warmer, softer, image-led, more immersive.
- Operations areas: ordered, spatial, map/list/table friendly.
- Advisory areas: formal, document-like, calm, and dense in a deliberate way.

3. Prefer editorial hierarchy over card spam.
- Use fewer, larger panels.
- Let one module dominate each viewport.
- Avoid repeating 6–12 identical cards unless the data truly requires it.

4. Use typography as the primary luxury signal.
- Elegant display serif for high-level headings only.
- Clean sans for UI and body copy.
- Strong whitespace, line length, and alignment discipline.

5. Build one elegant shell, then mode-shift inside it.
- Shared header, navigation, spacing rhythm, and panel system.
- Distinct visual treatment per mode without feeling like different products.

## Working method

When asked to design or refactor:
1. Identify which mode the feature belongs to: family, operations, or advisory.
2. Load the matching recipe from `resources/page-recipes.md`.
3. Apply the design principles and component rules.
4. Reuse the shared shell before inventing new structures.
5. Tighten copy to be specific, discreet, and calm.
6. Produce implementation that is ready for the repo's stack.

## Output expectations

When changing UI, Claude should:
- explain the proposed visual direction briefly
- identify the target mode
- name the specific components being introduced or updated
- implement production-ready code, not vague suggestions
- preserve accessibility and responsive behavior
- avoid placeholder-heavy, symmetrical AI-looking layouts
- **honor the standing copy conventions** (see `resources/copy-style.md` → "Casing & punctuation"): **Title Case** nav/menu/buttons/page-titles and email CTAs; leave `Eyebrow`/`SectionRule`/`StatLine` labels ALL-CAPS; keep body copy, form field labels, sentence-headings, and email subjects in sentence case; **no em-dashes (—)** in any user-facing copy (including `.ts` error strings, email templates, and the `/help` markdown) — except the `"—"` missing-value placeholder.

## Anti-pattern reminders

Never default to:
- three-column SaaS feature grids
- icons in colored circles
- giant rounded cards everywhere
- centered everything
- purple/blue startup gradients
- dashboard KPI rows that dominate the emotional tone of the page
- copy like "all-in-one solution" or "empowering your family journey"
