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
- shadcn/ui (radix-nova preset, neutral base color) — components live in `src/components/ui/`
- Supabase (Auth + Postgres + Storage) via `@supabase/ssr`
- Drizzle ORM — schema in `src/lib/db/schema.ts`, migrations output to `supabase/migrations/`

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
Supabase agent skills are installed at `.agents/skills/` (managed via `skills-lock.json`). Consult them when working on Supabase tasks — they're more current than training data:
- **supabase** — `.agents/skills/supabase/SKILL.md` (Auth, RLS, CLI, migrations, security checklist)
- **supabase-postgres-best-practices** — `.agents/skills/supabase-postgres-best-practices/SKILL.md` (RLS performance, indexing, locking, query patterns)

Update with `npx skills add supabase/agent-skills` (re-runs idempotently from the lock file).
