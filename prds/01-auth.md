# 01 — Authentication

**Phase**: 1 (first slice) · **Chunk**: 2 · **Depends on**: 1 (scaffolding), 3 (DB schema for profile auto-create trigger)
**Status**: ✅ Shipped (2026-05-23). See **Implementation** at the bottom.

## Goal

Every page except `/login` and `/auth/callback` requires a valid session. Sign-in is friction-free for older relatives — magic link by email, or "Sign in with Google" for Gmail users.

## User stories

- As a family member with an invitation, I enter my email on `/login`, click the link in my inbox, and land on the dashboard.
- As a Gmail user, I click "Sign in with Google" once and never see a password.
- As an admin, I never have to reset passwords because there aren't any.
- As any logged-in user, my session refreshes silently on every request.

## In scope

- `/login` page with email field + "Send magic link" + "Sign in with Google" buttons
- `/auth/callback` route handler that exchanges the code for a session and redirects to `/`
- Supabase Auth configured with magic link + Google OAuth provider
- `middleware.ts` that refreshes the session and redirects unauthenticated requests on app routes
- Sign-out action in the nav (clears Supabase session, redirects to `/login`)
- Trigger / Server Action that creates a `profiles` row on first sign-in (default `role='member'`, `email` and `full_name` from auth metadata)
- Invitation acceptance flow — if `invitations` table has a pending row for the email, mark `accepted` and honor the assigned `role`

## Out of scope (for first slice)

- Password sign-in (intentionally omitted — fewer foot-guns)
- Multi-factor auth
- Apple / Microsoft OAuth
- Account deletion UI

## Open questions

- Do we want an allowlist (only invited emails can sign in) or open signup? Recommendation: **allowlist** — every new email must match a pending invitation, OR be promoted by an admin from `/admin`.
- Default avatar source on Google sign-in: import Google profile photo to `avatar_url`? Recommendation: yes, on first sign-in only.

## References / reuse

- Supabase SSR helpers: `@supabase/ssr` with `createServerClient` / `createBrowserClient` in `src/lib/supabase/`
- See approved Next.js + Supabase auth template patterns; do not roll our own JWT handling.

## Implementation

**Key files**
- [src/app/(auth)/layout.tsx](../src/app/(auth)/layout.tsx) — centered card layout for unauthed pages
- [src/app/(auth)/login/page.tsx](../src/app/(auth)/login/page.tsx) — Server Component, reads `?error=` query for callback failures
- [src/app/(auth)/login/login-form.tsx](../src/app/(auth)/login/login-form.tsx) — Client Component using `useActionState` for the magic-link form, with a "check your email" success state
- [src/app/(auth)/login/actions.ts](../src/app/(auth)/login/actions.ts) — `sendMagicLink` + `signInWithGoogle` Server Actions; origin resolves via `NEXT_PUBLIC_SITE_URL` or request headers
- [src/app/auth/callback/route.ts](../src/app/auth/callback/route.ts) — exchanges code for session, redirects to `next` query param or `/`, bounces to `/login?error=…` on failure
- [src/app/sign-out/actions.ts](../src/app/sign-out/actions.ts) — `signOut` Server Action
- [src/proxy.ts](../src/proxy.ts) + [src/lib/supabase/middleware.ts](../src/lib/supabase/middleware.ts) — session refresh and auth-gating on every request except `/login`, `/auth/*`, and Next.js internals
- Profile auto-creation trigger: `handle_new_user()` in [supabase/migrations/20260523000001_schema.sql](../supabase/migrations/20260523000001_schema.sql); reads from `invitations` to assign role; backfill in `20260523000003_seed.sql`

**Decisions made during build**
- **Allowlist**: not enforced in trigger for first slice. New auth.users get `role='member'` if no matching invitation exists. Allowlist enforcement can be added later either in the trigger or via Supabase Auth provider restrictions. Seed admins (Danny + Dad) are handled via pre-seeded admin invitations.
- **Google avatar import**: yes — `handle_new_user` copies `raw_user_meta_data.avatar_url` (which is Google's CDN URL) into `profiles.avatar_url`. [src/lib/avatars.ts](../src/lib/avatars.ts) renders either pattern (http(s) URL → use directly; storage path → sign).
- **Password sign-in**: confirmed out of scope.

**Open follow-ups**
- Add explicit allowlist enforcement before chunk 6 ships, OR enable "Restrict to allowed emails" in Supabase Auth dashboard.
- Apple / Microsoft OAuth deferred indefinitely — revisit only if a family member asks.
