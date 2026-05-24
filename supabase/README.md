# Supabase migrations

SQL migrations in `migrations/` are the **source of truth** for the database
schema and RLS policies. The Drizzle schema in `src/lib/db/schema.ts` is a
hand-mirrored TypeScript version that gives the app types — it does *not*
generate or run migrations.

Files are numbered in apply order:

1. `20260523000001_schema.sql` — tables, indexes, `set_updated_at` trigger, `handle_new_user` trigger on `auth.users`
2. `20260523000002_rls.sql` — enable RLS on every table + policies
3. `20260523000003_seed.sql` — Loon Lake + Loon Cabin properties, admin invitations for Danny + Dad, backfill profiles for any already-authed users

The seed migration is idempotent. The schema and RLS migrations are not — apply each one at most once per database.

## Applying — option A: Supabase CLI (recommended)

The project ref is committed in [`config.toml`](./config.toml), so collaborators don't have to look it up.

```bash
# one-time setup, per machine
brew install supabase/tap/supabase
supabase login           # opens browser for personal access token

# from the repo root — picks up project_id from config.toml
supabase link
# (the CLI will prompt for the database password the first time;
#  find it in Supabase Dashboard → Project Settings → Database)

# apply migrations to the linked remote project
supabase db push
```

`supabase db push` reads `supabase/migrations/` in filename order and applies
anything that hasn't been applied yet. The CLI tracks applied migrations in
`supabase_migrations.schema_migrations` on the remote.

## Applying — option B: Dashboard SQL editor (no CLI required)

If you'd rather not install the CLI right now:

1. Supabase dashboard → **SQL Editor** → **New query**
2. Open `migrations/20260523000001_schema.sql` in your editor, copy the whole file, paste, **Run**
3. Repeat for `20260523000002_rls.sql`
4. Repeat for `20260523000003_seed.sql`

Run them in order. If you skip the first one, the others will fail with
"relation does not exist".

## Verifying it worked

After applying, in the Supabase SQL editor:

```sql
-- should return 7
select count(*) from information_schema.tables
 where table_schema = 'public'
   and table_name in
     ('profiles','properties','property_contacts','photos',
      'photo_subjects','revisions','invitations');

-- your profile should exist with role='admin'
select id, email, role from public.profiles;

-- two pending or accepted admin invitations
select email, role, status from public.invitations;

-- both properties present
select slug, name, status from public.properties;
```

In the app:

- Sign in → dashboard shows your name (from Google profile)
- Hitting the DB from the app should respect RLS — to be exercised in
  chunks 4 (family directory) and 5 (property pages)

## Writing new migrations later

```bash
# Creates an empty SQL file with a fresh timestamp in supabase/migrations/
supabase migration new <descriptive_name>
```

Then mirror any schema changes in `src/lib/db/schema.ts` so the app's types
stay in sync.

## When the schema changes — checklist

- [ ] New SQL migration in `supabase/migrations/`
- [ ] Mirror the change in `src/lib/db/schema.ts`
- [ ] If the change involves a new table: enable RLS, write policies
- [ ] `supabase db push` (or apply via dashboard)
- [ ] Run the verification queries above
