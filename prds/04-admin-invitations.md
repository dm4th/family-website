# 04 — Admin Panel & Invitations

**Phase**: 1 (first slice) · **Chunk**: 6 · **Depends on**: 2 (auth), 3 (DB schema)
**Status**: ✅ Shipped (2026-05-23). See **Implementation** at the bottom.

## Goal

Give a small set of admins (Dan, his dad, maybe one trustee) the tools to onboard the family without engineering work — invite by email, assign roles, deactivate, create properties.

## User stories

- As an admin, I open `/admin`, enter an email + role, and click "Invite". The invitee receives an email with a magic link tied to the invitation.
- As an admin, I see all current members with their roles and last-login timestamp.
- As an admin, I change someone's role from member → admin.
- As an admin, I create a new property (basic name + slug + location) and then any member can flesh it out via the wiki edit page.
- As a non-admin trying to reach `/admin`, I get a 404 or redirect.

## In scope

- `/admin` — admin-only landing with three tabs/sections: Members, Invitations, Properties
- Members tab: table of `profiles` with role dropdown, "Deactivate" button (soft-delete via a `deactivated_at` column to be added)
- Invitations tab: create form (email + role), pending list with "Resend" and "Revoke"
- Properties tab: create property form (name, slug, location), set active/inactive
- Invitation email via Resend; magic link includes the invitation token
- `/invite/[token]` — landing page that completes signup and applies the invited role on first auth

## Out of scope (for first slice)

- Activity log / login history beyond `last_sign_in_at` from Supabase
- Bulk invite (CSV upload)
- Email templating UI
- Granular per-feature permissions

## Open questions

- Do invitations expire? Recommendation: 30 days, set on creation.
- Can a member self-invite (e.g., share a link)? Recommendation: no for first slice — admins control the door.
- Add `deactivated_at` to `profiles` now, or wait until needed? Recommendation: add now since soft-delete is hard to retrofit cleanly.

## References / reuse

- Resend SDK + React Email for the invitation template — first email we send, so set this up cleanly. Reusable later for booking confirmations / digest emails.

## Implementation

**Key files**
- [src/app/(app)/admin/page.tsx](../src/app/(app)/admin/page.tsx) — Server Component, gates on `is_admin` via `supabase.rpc("is_admin")` (returns `notFound()` for non-admins so the page doesn't even acknowledge it exists). Renders three sections.
- [src/app/(app)/admin/actions.ts](../src/app/(app)/admin/actions.ts) — every action calls `requireAdmin()` first (auth + admin check). Actions: `changeMemberRole`, `setMemberActivation`, `createInvitation`, `revokeInvitation`, `sendInviteMagicLink`, `createProperty`, `setPropertyStatus`
- [src/app/(app)/admin/members-section.tsx](../src/app/(app)/admin/members-section.tsx) — table with per-row role dropdown + Deactivate/Reactivate (you can't edit your own role here, to avoid self-locking)
- [src/app/(app)/admin/invitations-section.tsx](../src/app/(app)/admin/invitations-section.tsx) — create form + pending list with "Email magic link" and "Revoke"
- [src/app/(app)/admin/properties-section.tsx](../src/app/(app)/admin/properties-section.tsx) — create form (auto-slug from name) + list with inline status dropdown + Edit link
- [src/app/(app)/layout.tsx](../src/app/(app)/layout.tsx) + [src/components/user-menu.tsx](../src/components/user-menu.tsx) — layout pulls `is_admin` once, passes to UserMenu; admins see an "Admin" item in the dropdown

**Decisions made during build**
- **Two-tier admin model** (added 2026-05-23): this PRD covers site-level admin only. A separate per-property admin role exists in [03-properties.md](03-properties.md) via the `property_admins` join table — those admins can change a property's status and (eventually) manage bookings, but cannot touch the roster or invitations.
- **No Resend / external email service**: dropped from this chunk. The flow works without it because:
  - `handle_new_user` already reads pending invitations and applies the role on any sign-in (Google or magic link)
  - The "Email magic link" button uses `supabase.auth.signInWithOtp({ shouldCreateUser: true })` to send Supabase's built-in magic-link email
  - Admins can also just share the portal URL via their existing channels (text, email, in person)
  - Resend can be wired in later for richer invitation copy if desired (see follow-ups)
- **Allowlist enforcement**: still not enforced — anyone with a sign-in works, but they get `role='member'` by default unless a matching pending invitation upgrades them. Acceptable for a small private family site; revisit if we want to lock the door tighter.
- **Self-edit guard**: the role dropdown and Deactivate button are disabled for the current user's own row in the UI. The trigger from `20260523000002_rls.sql` (column guard on `role` / `deactivated_at`) is what actually enforces this at the DB layer.
- **Invitation expiry**: 30 days from creation, hardcoded.
- **Invitation collisions**: the `invitations_one_pending_per_email` partial unique index from `20260523000001_schema.sql` prevents double-pending invites; the action surfaces a friendly error if it fires.
- **No `/invite/[token]` landing page**: not needed since the trigger does the matching by email. If we ever want a custom welcome landing, the `token` column is ready.

**Open follow-ups (not blocking)**
- Resend integration + React Email template for richer invitation copy
- Activity log / login history (Supabase exposes `last_sign_in_at` on auth.users — surface it on the members section)
- Bulk invite (CSV) — defer until needed
- `/invite/[token]` landing if we want a more personal welcome
- Add a confirmation modal (shadcn `AlertDialog`) instead of the browser `confirm()` calls in the destructive actions
