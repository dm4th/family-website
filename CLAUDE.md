@AGENTS.md

# Family Website — Project Notes

## Source of truth
- **Master plan**: [prds/00-master-plan.md](prds/00-master-plan.md). Per-feature plans live in `prds/01-…` through `prds/10-…`. Update the plan before drifting from it.

## Starting a new feature session

If you're picking up a single feature (the first-slice foundation is done; future work is small parallel slices):

1. **Read [prds/00-master-plan.md](prds/00-master-plan.md)** — start at the "Starting a new session" + "Active queue" sections. Pick a PRD that's status 🟢 or 🚧.
2. **Read that PRD top-to-bottom.** Each unshipped one has Onboarding / Pre-flight decisions / Likely file layout / Verification recipe to bootstrap you.
3. **Don't reinvent shared infrastructure.** The master plan's "Foundation that's already built" section is the inventory — reuse `PhotoUpload`, `recordRevision()`, `canManageProperty()`, `withSignedUrls()`, `Markdown`, etc.
4. **Branch + ship + update.** When you're done, update the PRD's Implementation section (key files, decisions, follow-ups) and flip status to ✅ in both the PRD header and the master-plan chunk table.

Smaller is better. The first-slice build was deliberately monolithic; from here every feature should be its own session/branch so it can be reviewed, parallelized, and reverted in isolation.

## Stack
- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind v4
- shadcn/ui (radix-nova preset) — primitives in `src/components/ui/`; **family-office shell primitives** in `src/components/shell/` (SalonPanel, LedgerPanel, BriefingPanel, PageIntro, Eyebrow, SectionRule, StatLine, ActivityDigest)
- Fonts: **Fraunces** (display serif, heroes/section titles only) + **Inter** (UI/body/controls/tables) via `next/font/google`; loaded in [src/app/layout.tsx](src/app/layout.tsx)
- Supabase (Auth + Postgres + Storage) via `@supabase/ssr`
- Drizzle ORM — schema in `src/lib/db/schema.ts`, migrations output to `supabase/migrations/`

## Design system

The visual direction is **"private family office meets premium members club"** — restrained, editorial, multi-generational. Three emotional zones, never mixed casually:

- **Family** mode (burgundy accent) — profiles, photos, stories, milestones. Warm, image-led, generous whitespace. Use `SalonPanel`.
- **Operations** mode (forest accent) — properties, vendors, logistics. Orderly, scannable, table-friendly. Use `LedgerPanel`.
- **Advisory** mode (deep teal accent) — admin, governance, trust, finances. Memo-like, disciplined hierarchy, fine rules. Use `BriefingPanel`.

Tokens live in [src/app/globals.css](src/app/globals.css) — surface (ivory/parchment/ink), mode accents, bronze detailing, shadows (whisper/panel/portrait).

**Before building or refactoring a page**, two skills should auto-load and steer you:

- `family-office-ui` — visual system, component rules, tone, anti-patterns. [.claude/skills/family-office-ui/SKILL.md](.claude/skills/family-office-ui/SKILL.md)
- `page-mode-orchestrator` — classify the page into Family / Operations / Advisory before designing. [.claude/skills/page-mode-orchestrator/SKILL.md](.claude/skills/page-mode-orchestrator/SKILL.md)

**Five non-negotiables** (from the `family-office-ui` skill):

1. Default to restraint — mostly neutral surfaces, one accent family at a time, no loud gradients or neon.
2. Create clear emotional zoning — each interior page has one dominant mode.
3. Editorial hierarchy over card spam — fewer larger panels, one dominant module per viewport.
4. Typography as primary luxury signal — Fraunces for hero titles only, Inter for everything else.
5. Build one elegant shell, then mode-shift inside — shared header/nav/spacing/panels.

**Never default to**: three-column SaaS feature grids, icons in colored circles, giant rounded cards everywhere, centered everything, candy-colored status pills, marketing-hype copy.

**Copy & casing conventions** (standing family decision — full rules in [.claude/skills/family-office-ui/resources/copy-style.md](.claude/skills/family-office-ui/resources/copy-style.md) → "Casing & punctuation"): **Title Case** nav/menu labels, page titles, button/CTA labels, and email CTA buttons; leave `Eyebrow`/`SectionRule`/`StatLine` labels ALL-CAPS (don't re-case the source); keep body copy, form field labels, sentence-style headings, and **email subjects** in sentence case; **never use em-dashes (—)** in user-facing copy — rendered JSX, `.ts` error/`state.message` strings, email templates, and the `/help` markdown — replacing them by sense (the `"—"` missing-value placeholder is the one exception). New pages and emails must not reintroduce sentence-case buttons or em-dashes.

## Conventions
- **Supabase keys**: prefer the new **publishable key** (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). The legacy anon key is supported as a fallback in [src/lib/supabase/env.ts](src/lib/supabase/env.ts). Never expose the service-role / secret key in client code.
- **Next.js 16**: this version renamed `middleware.ts` → `proxy.ts` and the exported function to `proxy()`. See [src/proxy.ts](src/proxy.ts).
- **Auth gating**: every route is auth-gated except `/login`, `/auth/*`, and Next internals. Enforced in [src/proxy.ts](src/proxy.ts) + [src/lib/supabase/middleware.ts](src/lib/supabase/middleware.ts).
- **RLS**: enabled on every table from day one. See the supabase-postgres-best-practices skill for patterns.
- **Admin model — two tiers**:
  - **Site admin** (`profiles.role = 'admin'`): roster, invitations, creating/deleting properties. Helper: `is_admin()` SQL function + `requireAdmin()` in `src/app/(app)/admin/actions.ts`.
  - **Property admin** (`property_admins` join table): per-property elevated rights (change status, eventually hero image and bookings). Helper: `is_property_admin(uuid)` SQL function + `canManageProperty(id)` in `src/lib/property-auth.ts`.
  - Any new property-scoped admin operation should go through `canManageProperty()` so site admins and property admins both qualify.
- **PRDs are living documents**: when finishing a chunk, update its PRD in `prds/` with an **Implementation** section (key files, decisions made during build, open follow-ups) and flip its status header to `✅ shipped`. Also update the chunk-status table in [prds/00-master-plan.md](prds/00-master-plan.md). PRDs are how subagents and future-you understand what's actually in the codebase vs. what was planned.

## Skills available

**Design skills** are in [.claude/skills/](.claude/skills/) and load automatically when you work on UI:
- **family-office-ui** — visual direction, panel system, copy tone
- **page-mode-orchestrator** — page-mode classification (Family / Operations / Advisory)

**Supabase agent skills** are installed at `.agents/skills/` (managed via `skills-lock.json`). Consult them when working on Supabase tasks — they're more current than training data:
- **supabase** — `.agents/skills/supabase/SKILL.md` (Auth, RLS, CLI, migrations, security checklist)
- **supabase-postgres-best-practices** — `.agents/skills/supabase-postgres-best-practices/SKILL.md` (RLS performance, indexing, locking, query patterns)

Update Supabase skills with `npx skills add supabase/agent-skills` (re-runs idempotently from the lock file).
