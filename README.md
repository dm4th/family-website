# Family Portal

Private portal for the Mathieson family — directory, shared properties (Squam Lake, Big Sky), wiki-style content, photo collection. Future phases add property booking, trust-document AI, financial dashboard. See [prds/00-master-plan.md](prds/00-master-plan.md) for the architecture + roadmap.

**Production**: https://mathiesonfamily.app
**Stack**: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui · Supabase (Postgres + Auth + Storage) · Drizzle ORM · Vercel

---

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.local.example .env.local
# …then fill in the values from your Supabase project (see env-vars section below)

# 3. Apply database migrations (one-time per fresh database)
brew install supabase/tap/supabase   # if you don't have the CLI
supabase login                       # personal access token, opens browser
supabase link                        # picks up project_id from supabase/config.toml
supabase db push                     # applies everything in supabase/migrations/

# 4. Run the dev server
npm run dev                          # http://localhost:3000
```

Migrations and conventions are documented in [supabase/README.md](supabase/README.md). Project-wide rules live in [CLAUDE.md](CLAUDE.md).

## Environment variables

| Var | Where used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | client + server | Preferred. Falls back to `NEXT_PUBLIC_SUPABASE_ANON_KEY` if unset. |
| `DATABASE_URL` | Drizzle migrations only | Session pooler connection string from Supabase. |
| `NEXT_PUBLIC_SITE_URL` | server actions | Canonical origin for OAuth + magic-link redirects. Set to `https://mathiesonfamily.app` in production. |

Never expose the Supabase service-role / secret key in client code. The current codebase doesn't need it; if a future feature does, store it as a non-`NEXT_PUBLIC_` server-only var.

## Project layout

```
src/
├── app/
│   ├── (auth)/             # /login, callbacks — unauthed
│   ├── (app)/              # everything auth-gated: dashboard, family, properties, admin
│   ├── auth/callback/      # OAuth + magic-link callback (route handler)
│   ├── sign-out/           # sign-out server action
│   └── layout.tsx          # root layout (fonts, metadata)
├── components/             # shadcn/ui in components/ui/, custom alongside
├── lib/
│   ├── supabase/           # @supabase/ssr clients + middleware helper
│   ├── db/                 # Drizzle schema + client (types only; SQL is source of truth)
│   ├── photos.ts           # storage path generation + signed-URL batching
│   ├── avatars.ts          # http URL vs storage path resolution
│   ├── property-auth.ts    # canManageProperty() — single helper for property-scoped admin checks
│   └── revisions.ts        # audit-log diff + insert
└── proxy.ts                # Next.js 16 proxy (session refresh + auth gate)

supabase/
├── migrations/             # source of truth — applied via `supabase db push`
├── config.toml             # project ref (committed; per-machine state lives in .temp/)
└── README.md               # migration apply guide + verification queries

prds/                       # per-feature plans, updated as we ship
.agents/skills/             # supabase + supabase-postgres-best-practices agent skills
```

## Deploy to production (Vercel)

> One-time setup. Subsequent deploys happen automatically on `git push` once the Vercel ↔ GitHub link is in place.

### 1. Push to GitHub

Create an empty private repo (e.g., `family-portal`), then from this directory:

```bash
git remote add origin git@github.com:<your-user>/<your-repo>.git
git push -u origin main
```

### 2. Create the Vercel project

- Vercel Dashboard → **Add New… → Project** → import the GitHub repo
- Framework preset: **Next.js** (auto-detected)
- Root directory: leave at repo root
- Build / install / output commands: defaults
- **Environment variables** — paste the four from `.env.local`:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `DATABASE_URL` (only needed if you ever run Drizzle introspection from a Vercel build; not required for the app itself, but harmless)
  - `NEXT_PUBLIC_SITE_URL=https://mathiesonfamily.app`
- Click **Deploy**. First build takes ~1–2 min.

### 3. Wire the custom domain

- Vercel project → **Settings → Domains → Add** → `mathiesonfamily.app`
- Follow Vercel's DNS instructions (CNAME or A records at your registrar)
- Add `www.mathiesonfamily.app` as an alias if you want www → apex redirect

### 4. Update Supabase Auth for production

In Supabase Dashboard → **Authentication → URL Configuration**:

- **Site URL**: `https://mathiesonfamily.app`
- **Redirect URLs** — add (keep localhost for dev):
  - `https://mathiesonfamily.app/auth/callback`
  - `http://localhost:3000/auth/callback` (already there from local dev)
  - Optional, for preview deploys: `https://*-<vercel-team-slug>.vercel.app/auth/callback`

### 5. Verify the Google OAuth client

The OAuth client's redirect URI points at **Supabase**, not at our app — already configured. Confirm it's still:

- `https://<your-project-ref>.supabase.co/auth/v1/callback`

No change needed for the custom domain because the OAuth flow goes Google → Supabase → us. Google never sees our domain.

### 6. Smoke test on production

After the first deploy lands:

1. Open `https://mathiesonfamily.app` on a phone → redirects to `/login` ✓
2. Sign in with Google → lands on the dashboard ✓
3. Open `/family` → you appear ✓
4. Open `/properties/loon-a-see` → seeded properties render ✓
5. Open user menu → "Admin" link visible (you're the seed admin) ✓
6. Upload a photo to your profile → appears, "Use as my avatar" works ✓
7. Open `/coming-soon/booking` → renders the placeholder copy ✓

If anything fails, check **Vercel → Deployments → [latest] → Runtime Logs** first — the most common cause is a missing or misspelled env var.

## Day-to-day commands

```bash
npm run dev                      # dev server with Turbopack
npm run build                    # production build (good pre-push sanity check)
npm run lint                     # ESLint
npx tsc --noEmit                 # standalone typecheck

supabase migration new <name>    # new SQL migration
supabase db push                 # apply pending migrations
```

When you change the database schema, mirror the change in [`src/lib/db/schema.ts`](src/lib/db/schema.ts) and update the relevant PRD's Implementation section. See [CLAUDE.md](CLAUDE.md) for the full conventions list.

## What's shipped (first slice)

- Auth — magic link + Google OAuth, session-refresh proxy
- Family directory + profile pages — photo collection, avatar promotion
- Properties — wiki-editable content (description, how-to, rules, amenities, contacts), photo galleries
- Admin panel — roster management, invitations, property creation
- Property admins — per-property elevated role for status / lifecycle
- Coming-soon placeholders for booking, documents, finances, messaging, timeline

What's intentionally out of the first slice (per [prds/00-master-plan.md](prds/00-master-plan.md)): property booking, trust-document RAG, financial dashboard, messaging, family timeline.
