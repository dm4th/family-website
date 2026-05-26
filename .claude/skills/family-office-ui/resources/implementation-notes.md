# Implementation notes

## If the stack is React / Next.js / Tailwind
- Build a shared shell layout first
- Create explicit mode tokens for family, operations, and advisory
- Keep the base surface and typography tokens shared across all modes
- Let mode styling appear through accent, imagery treatment, spacing density, and panel style

## Suggested token model
- color.bg
- color.surface
- color.surfaceRaised
- color.text
- color.textMuted
- color.border
- color.accent.family
- color.accent.operations
- color.accent.advisory
- radius.soft
- radius.base
- radius.tight
- shadow.whisper
- shadow.panel
- font.display
- font.body

## Suggested components
- AppShell
- PageIntro
- ModeTabs or SectionRail
- SalonPanel
- LedgerPanel
- BriefingPanel
- PropertyFacts
- FamilyProfileHero
- GalleryStoryGrid
- AdvisorySummary
- ActivityDigest

## Refactor strategy
When upgrading an existing page:
1. remove repeated generic cards
2. identify the one dominant block
3. restack information into chapters
4. upgrade typography and spacing before adding visual ornament
5. introduce mode-specific panel type
6. only then add imagery or subtle motion

## Review checklist
- Does the page feel like a private environment rather than a startup tool?
- Is there one dominant focal area?
- Is the mode obvious from the first screenful?
- Are cards used sparingly?
- Are photos immersive where appropriate?
- Are trust/advisory surfaces sober and document-like?
- Does the page still work cleanly on mobile?
