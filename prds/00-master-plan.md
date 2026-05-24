# Family Trust Portal — Master Plan

> **Source of truth**: the original lives at `~/.claude/plans/this-is-the-first-clever-avalanche.md`. This copy is kept in the repo so subagents working off `prds/` see it. Edit the source; refresh this copy when it changes.

## Chunk status

| # | Chunk | Status | PRD |
|---|---|---|---|
| 1 | Project scaffolding | ✅ shipped | — |
| 2 | Auth + session shell | ✅ shipped | [01-auth](01-auth.md) |
| 3 | DB schema + RLS + seed | ✅ shipped | — (see [supabase/README.md](../supabase/README.md)) |
| 4 | Family directory + profiles + photo uploads | ✅ shipped | [02-family-directory](02-family-directory.md) |
| 5 | Property pages + wiki editing | ✅ shipped | [03-properties](03-properties.md) |
| 6 | Admin panel + invitations | ✅ shipped | [04-admin-invitations](04-admin-invitations.md) |
| 7 | Coming-soon stubs + dashboard polish | ✅ shipped | — |
| 8 | Deploy + smoke test | 🚧 ready — pending Vercel/DNS | See README §Deploy |

**First-slice deploy notes (2026-05-23)**
- Domain: `mathiesonfamily.app`
- Local prep done: production build clean, README has full Vercel + Supabase + Google checklist, first commit on `main`
- Pending: push to GitHub, create Vercel project, attach domain, add prod Auth redirect URLs in Supabase, run smoke test on phone
- All instructions are in [../README.md](../README.md) §Deploy to production

## Context

This is the first build session of a private family website Dan's dad asked him to build over a year ago. The audience is a multi-generational family (~23 people today, growing):

- **Gen 1 (5)**: 3 siblings in their 60s + 2 spouses (the older sister has passed; one sibling is single)
- **Gen 2 (15)**: 9 grandchildren + 6 spouses of those grandchildren — **spouses are first-class family members**, not a separate role
- **Gen 3 (3)**: great-grandchildren, with more coming

Core needs: (a) coordinating around shared family properties (starting with Loon Lake — Loon Cabin and the main lake place), (b) eventually surfacing trust/wealth-management documents through agentic search, and (c) a private place for the family to share information. Members edit content collaboratively (wiki-style) so this doesn't become one person's full-time maintenance job.

Two prior PRDs (`MVP-PRD.pdf`, `FUTURE-PRD.pdf`) are roughly a year old and assumed Next.js 14 + Supabase. We re-evaluated from first principles and chose to ship a minimum slice — **auth + property page + family directory, with everything else stubbed as "Coming Soon"** — that the family can start using immediately. Trust-doc sensitivity decisions are intentionally deferred until before Phase 3.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database + Auth + Storage | Supabase (managed Postgres + Auth + Storage, pgvector for future RAG) |
| ORM | Drizzle |
| Image handling | `next/image` + Supabase Storage transforms |
| Email (later) | Resend + React Email |
| Hosting | Vercel |
| AI / RAG (Phase 3) | Vercel AI SDK + Anthropic Claude + pgvector |

Rejected alternatives: Convex, Cloudflare full-stack, T3 stack, Remix. See source plan for rationale.

## Data model (first slice)

`profiles`, `properties`, `property_contacts`, `photos`, `photo_subjects`, `revisions`, `invitations`. See source plan for SQL. RLS enabled on every table from day one.

Deferred: `bookings` (Phase 2), `documents` + `document_chunks` (Phase 3), `family_relationships`, `property_access`.

## Storage posture

- **Photos / general family docs** → Supabase Storage from day one.
- **Trust / legal / financial docs** → not accepted yet. Phase 3, after security decision.
- **Google Photos / Drive** → don't build sync. Add Picker integrations later if asked (Phase 1.5/2). Copy selected files into Supabase so we own the canonical copy.

## Permissions (first slice)

- Any member can upload photos to *any* profile or property.
- Profile owner picks which photo is their avatar.
- Any member can edit property `description`, `how_to`, `guidelines`, `amenities`, `property_contacts` — every save writes a `revisions` row.
- Only admins can create/deactivate properties, invite members, or change roles.

## First-slice pages

- `/login` — magic link + Google OAuth
- `/` — dashboard with feature cards + Coming Soon
- `/family`, `/family/[id]`, `/profile/edit`
- `/properties`, `/properties/[slug]`, `/properties/[slug]/edit`
- `/admin`
- `/coming-soon/[feature]`

## Sequencing (subagent chunks)

1. **Project scaffolding** — `create-next-app`, Tailwind v4, shadcn, Drizzle, Supabase clients, env, middleware
2. **Auth + session shell** — `/login`, magic link + Google OAuth, callback, middleware gate, nav shell
3. **DB schema + RLS migrations + seed** — Drizzle schema, SQL migrations, Loon Lake + Loon Cabin seed, profile-on-signup trigger
4. **Family directory + profile pages + photo contributions** — `/family`, `/family/[id]`, `/profile/edit`, photo upload component, avatar selection (can parallelize with 5)
5. **Property pages + wiki editing** — `/properties`, detail page, edit page, gallery, contacts list, revisions on save (can parallelize with 4)
6. **Admin panel + invitations** — `/admin`, invite-by-email, role changes, acceptance landing
7. **Coming-soon stubs + dashboard polish**
8. **Deploy + smoke test** — Vercel + prod Supabase, real-phone walkthrough

## Verification (first slice done when)

1. Auth: magic link + Google both work; new user gets a `profiles` row
2. RLS: logged-out → redirect; raw API call returns 0 rows
3. Family directory shows everyone with avatars + branches; spouses inline
4. Profile self-edit works; cannot edit others
5. Properties seeded; detail page shows all sections
6. Any member can edit a property; `revisions` row recorded
7. Photo contribution to someone else's profile works with attribution
8. Admin can invite; non-admin can't reach `/admin`
9. Mobile-good (Lighthouse ≥ 85 on property detail)
10. All of the above on the deployed URL

## Open decisions for later

- Trust-doc security model (before Phase 3)
- Property access scoping (per-branch?)
- Calendar source of truth (own DB vs. two-way Google Calendar sync)
- Trust-doc taxonomy — needs a real conversation with Dan's dad
