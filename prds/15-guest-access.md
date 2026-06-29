# 15 — Guest Access

**Phase**: 3 · **Depends on**: 02 (members + profiles exist), 06 (properties + bookings exist)
**Status**: 🟢 ready

> ⚠️ **This is the most architecturally significant PRD in the queue.** Every RLS policy shipped so far is effectively `to authenticated using (true)` — *any* signed-in user can read *everything*. The `guest` role exists in the schema (`profiles.role`, `invitations.role`) but is **completely unenforced**: a guest today sees the entire site. This PRD introduces the first real **read differentiation between member and guest** across the whole database. Get the RLS wrong and you either lock members out or leak the family's private data to an outsider. **Build it carefully, behind a branch, with the negative tests in the [Verification recipe](#verification-recipe) treated as acceptance criteria — not optional.**

---

## Onboarding (read first if you're picking this up cold)

1. **Read** [CLAUDE.md](../CLAUDE.md) (esp. the **two-tier admin model** + **RLS conventions**), [AGENTS.md](../AGENTS.md) (this is Next 16 — read `node_modules/next/dist/docs/` before touching the proxy/middleware), [prds/00-master-plan.md](00-master-plan.md), then this file.
2. **Read the current access model end-to-end before writing a line of SQL:**
   - [supabase/migrations/20260523000001_schema.sql](../supabase/migrations/20260523000001_schema.sql) — `profiles.role check (role in ('admin','member','guest'))`, `handle_new_user()` adopting `invitations.role`, the `invitations` table.
   - [supabase/migrations/20260523000002_rls.sql](../supabase/migrations/20260523000002_rls.sql) — **every** policy here is `using (true)` for authenticated. This is the file you're amending. Note `is_admin()` as the template for a `security definer` identity helper.
   - [supabase/migrations/20260523000006_property_admins.sql](../supabase/migrations/20260523000006_property_admins.sql) — `is_property_admin(uuid)` + `property_admins` join. **Your new `property_guests` join + `is_property_guest(uuid)` helper mirror this file almost exactly.**
   - [supabase/migrations/20260525000001_bookings.sql](../supabase/migrations/20260525000001_bookings.sql) — `bookings` RLS (`using (true)` SELECT) and the `enforce_booking_transitions` trigger pattern.
   - [src/proxy.ts](../src/proxy.ts) + [src/lib/supabase/middleware.ts](../src/lib/supabase/middleware.ts) — the global auth gate (public-path allow-list). This is where guest **route** gating plugs in.
   - [src/lib/property-auth.ts](../src/lib/property-auth.ts) — `canManageProperty()`. You'll write the read-side analogue `canViewProperty()`.
   - [src/app/(app)/layout.tsx](../src/app/(app)/layout.tsx) — already does a belt-and-braces `getUser()` + `is_admin()` RPC; the per-request guest check can live alongside it.
3. **You will reuse**: the `is_admin()` / `is_property_admin()` `security definer` pattern, the `property_admins` join shape, `canManageProperty()` structure, the invitation flow in [src/app/(app)/admin/actions.ts](../src/app/(app)/admin/actions.ts) (`requireAdmin()`, `createInvitation`, `sendInviteMagicLink`), and the `RevisionEntity` audit pattern if you log grants.
4. **Skills**: consult `.agents/skills/supabase` (RLS patterns, `security definer` safety, the `(select auth.uid())` caching idiom) and `.agents/skills/supabase-postgres-best-practices` (policy performance — these new policies run on every read).

## Goal

Introduce a **property-scoped guest** role. A guest can sign in and see **only the property pages they have been explicitly granted** (a family member links them to a stay) — property info, contacts, photos, and at most that property's calendar. **Everything else on the site is invisible and inaccessible to them**: the family directory, other people's profiles, legacy material, admin, the unified calendar, and any property they weren't granted. If a guest has access to exactly one property, drop them straight onto it; if they have 2+, show them a properties list filtered to only theirs.

This is the family's literal ask (Session D of the [testing playbook](../docs/testing-playbook.md)):

> "What permissions do guests have? I think we should let them be guests of specific properties by letting family members link guests to stays. Then they can login to any property page of which they have been a guest of. Otherwise, guests should not be able to view any pages on the site. If a guest is a guest of 2+ properties, let them select the properties page and only load properties they have guest access to."

## User stories

- **As a guest** (a friend renting Loon House for a week), I get an invite link, sign in, and land directly on the Loon House page — its how-to, contacts, photos, and the dates I'm staying. I cannot see the family directory, the other properties, the admin area, or anyone's profile. If I'm hosting at two properties this summer, I see a short list of just those two and pick one.
- **As a guest** poking around, when I type `/family`, `/admin`, `/calendar`, or a property I wasn't granted into the URL bar, I'm bounced — never shown the page, never able to read the data behind it via the API.
- **As a family member** (Sarah) hosting a guest, I open the property page (or the booking I created), click "Add a guest," enter their email, and they're granted read access to *this property only*. I can see who I've granted and revoke access when the stay is over.
- **As a site admin**, I can see all guest grants, invite guests with a property attached in one step, and revoke any grant. I can confirm at a glance that a guest's blast radius is exactly the properties on their grant list.

## Pre-flight decisions (decide before writing code)

| Decision | Recommendation | Why |
|---|---|---|
| **Access data model** | **Explicit `property_guests` join** (`property_id`, `profile_id`, `granted_by`, `created_at`, optional `booking_id`, optional `expires_at`) — *not* derived from a guest being named on a booking. | RLS becomes a trivial `exists (… where profile_id = auth.uid())`, mirroring `property_admins`. Deriving from bookings would force every read policy to reason about booking status/dates and couples "can view" to "has an active stay," which is fragile. Keep grant ≠ booking. |
| **Auto-grant from "link guest to a stay"** | When a member links a guest to a booking, **auto-create the `property_guests` row** for that booking's property (store `booking_id` for provenance). Members can also grant access to a property *without* a booking. | Matches the family's mental model ("link guests to stays") without making the booking the source of truth. The join stays the single authority RLS checks. |
| **Who can grant guest access to a property** | Any **member** (`role='member'` or `admin`) — wiki-style, consistent with "any member can edit a property." Guests can never grant. Revocation: the grantor, any member, or admin. | The family is the trust boundary; a guest's host is whichever family member invited them. Don't over-restrict to property admins — that's friction the booking system already declined for editing. |
| **What a guest can see on a granted property** | **Read-only**: name, location, description, how-to, guidelines, amenities, **contacts**, **photos**, and **that property's calendar** (dates booked, but *not* other guests'/members' names or notes — show availability, not identities). **No** wiki edit, **no** booking requests, **no** other property's anything. | Read-only is the safe default and the literal ask. Contacts (caretaker/plumber) are genuinely useful to a guest mid-stay. Calendar identities are family-private → render the guest a redacted "booked / available" view. |
| **Can a guest see who else is staying?** | **No.** A guest sees only their own grant + a redacted busy/free calendar. Names, guest counts, and notes of *other* bookings are hidden. | Least privilege. A renter doesn't need the family's travel schedule or other guests' identities. |
| **Guest profile / directory** | A guest has a `profiles` row (needed for auth) but is **excluded from the directory** and **cannot read any other profile**. A guest may read/edit **their own** profile row only. | The directory is family-only. Guests still need a row so bookings/grants can reference them and so they can manage their own login. |
| **How a guest is created** | Extend the invitation flow: `role='guest'` invite **plus a property grant**, created together. The inviting member links them; the grant lands as soon as the guest's profile exists (or immediately if they already have one). | Reuses `invitations` + `handle_new_user`. The one wrinkle: the grant references `profile_id`, which doesn't exist until first sign-in — see the **deferred-grant** note in [In scope](#in-scope). |
| **Defense in depth** | **Three layers, all required**: (1) RLS on every table (the real guarantee), (2) middleware route-redirect for guests hitting forbidden top-level routes, (3) per-page server checks (`notFound()`/`redirect()`). | RLS is the only thing that stops a direct PostgREST/API call; the route + page checks are UX so a guest never sees a broken/empty shell. Never rely on routing alone. |
| **Relationship to the open "property access scoping" decision** | This PRD **partially supersedes** it: it delivers scoping *for guests*. Member-to-family-branch property scoping stays **out of scope** and open. | The master plan + [PRD 06 follow-ups](06-property-booking.md#open-follow-ups) flag "property access scoping" as undecided. Guests are the urgent, well-specified slice; branch scoping for members is a separate, larger question. |

## In scope

### 1. Data model

A new migration adds the join + helper, mirroring `property_admins`:

```sql
-- property_guests — explicit, per-property read grant for guest-role profiles.
create table public.property_guests (
  property_id uuid not null references public.properties(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id)   on delete cascade,
  booking_id  uuid references public.bookings(id) on delete set null, -- provenance, nullable
  granted_by  uuid references auth.users(id) on delete set null,
  expires_at  timestamptz,        -- optional; null = no expiry
  created_at  timestamptz not null default now(),
  primary key (property_id, profile_id)
);
create index property_guests_profile_idx on public.property_guests (profile_id);

-- is_property_guest(uuid): does the caller hold an (unexpired) grant for this property?
create or replace function public.is_property_guest(p_property_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.property_guests
     where property_id = p_property_id
       and profile_id = (select auth.uid())
       and (expires_at is null or expires_at > now())
  );
$$;

-- is_guest(): is the caller's profile a guest (vs. member/admin)?
-- ⚠️ DO NOT add `and deactivated_at is null` here. is_guest() decides which access
-- *bucket* a profile falls into, and every read policy is written
-- `not is_guest() or <grant>`. If a *deactivated* guest made this return false,
-- then `not is_guest()` would be TRUE and they'd silently get full MEMBER-level
-- read access — a privilege escalation in the wrong direction (deactivating a
-- guest would *widen* their access). A guest is a guest regardless of activation;
-- lock deactivated users out separately (see the deactivation note below).
create or replace function public.is_guest()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
     where id = (select auth.uid()) and role = 'guest'
  );
$$;

-- can_view_property(uuid): the read-side analogue of canManageProperty.
-- True if the caller is a member/admin (sees all) OR a guest with a grant.
create or replace function public.can_view_property(p_property_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not public.is_guest() or public.is_property_guest(p_property_id);
$$;
```

- **Deferred-grant for not-yet-existing guests**: a `property_guests` row needs a `profile_id`, which doesn't exist until the invited guest first signs in. Two options — pick one and document it:
  - **(A, recommended)** Store the pending grant on the **invitation** (add `invitations.grant_property_id uuid`) and have `handle_new_user()` create the `property_guests` row when it adopts a `role='guest'` invitation. Self-contained, no extra table.
  - **(B)** A `pending_property_guests (email, property_id, …)` staging table consumed on first login. More flexible (multiple properties pre-grant) but more surface.
- Mirror the new table + columns in [src/lib/db/schema.ts](../src/lib/db/schema.ts) (`propertyGuests`, and `grantProperty` on `invitations` if option A).
- `granted_by` is provenance; `expires_at` lets a stay's access lapse automatically (optional in v1 but cheap to include).
- **Deactivation (read the `is_guest()` warning above).** Because `is_guest()` intentionally ignores `deactivated_at`, a deactivated guest stays in the guest bucket (scoped), not the member bucket — good. But they could still see their *granted* property until the grant is revoked. To fully lock out a deactivated user of any role, enforce deactivation **separately and bluntly**: block deactivated users at sign-in / in middleware (no usable session), and/or have `setMemberActivation` revoke `property_guests` rows on deactivation. Do **not** try to encode "active" into `is_guest()` — that reintroduces the escalation. Add the deactivated-guest case to the negative tests.

### 2. RLS — per-table plan (the heavy part)

Today's policies are `to authenticated using (true)`. Each must become **guest-aware**. The pattern: keep members/admins at full read, gate guests through a grant. Write the predicate as `not public.is_guest() or <grant check>` so members short-circuit to `true` and only guests pay the `exists` cost.

| Table | Guest SELECT | Guest write |
|---|---|---|
| **properties** | `not is_guest() or is_property_guest(id)` — guest sees only granted properties. | None (guests never insert/update/delete). |
| **property_contacts** | `not is_guest() or is_property_guest(property_id)` | None. |
| **photos** | `not is_guest() or (property_id is not null and is_property_guest(property_id))` — guests see only photos attached to a granted property; **profile-only / legacy photos (no `property_id`) are hidden.** | None (insert policy already `auth.uid() = uploaded_by`; guests simply won't have the UI, and you may additionally `and not is_guest()` the insert check). |
| **photo_subjects** | Hidden or grant-scoped. Subjects tie photos to *people* (family). Safest: `not is_guest()` (guests don't see person-tagging at all), or scope to subjects of photos on granted properties. **Recommend hide entirely for guests.** | None for guests. |
| **bookings** | **Redacted.** A guest may read only: (a) **their own** bookings (`requested_by = auth.uid()`), and (b) for availability, the route should expose granted-property bookings as **busy/free without identities**. Recommended approach: keep the table policy `not is_guest() or requested_by = auth.uid()` (a guest reads only their own rows), and build the redacted availability view in the **Server Component / query layer** via a `security definer` RPC (e.g. `property_busy_ranges(property_id)` returning only `start_date,end_date` for approved bookings on a property the caller can view). Don't expose member identities through RLS. | INSERT/UPDATE already self-scoped; additionally `and not is_guest()` if guests must not request bookings (recommended for v1 — guests don't book). |
| **profiles** | **Locked down.** Replace `using (true)` with `not is_guest() or id = auth.uid()` — a guest reads **only their own** profile; members/admins still read all. | Self-update stays (`auth.uid() = id`); the `guard_profile_privileged_columns` trigger already blocks role/deactivation changes. A guest cannot change their own role to escalate. |
| **people** (legacy keystone, [20260624000001_people.sql](../supabase/migrations/20260624000001_people.sql)) | **Hidden from guests entirely**: `not is_guest()` (or `is_guest() = false`). Legacy is family-only. | None for guests. |
| **revisions** | `not is_guest()` — guests see no edit history. | Guests don't write revisions (they don't edit). |
| **invitations** | Already admin-only — unchanged (guests fail `is_admin()`). | Unchanged. |
| **property_admins** | Currently `using (true)` read. Tighten: `not is_guest()` for read (a guest needn't know who admins a property). | Insert/delete already gated by `is_admin() or is_property_admin`. |
| **property_guests** (new) | Member/admin read all; a guest reads **only their own grants** (`profile_id = auth.uid()`). | INSERT: `is_admin() or (is member and not is_guest())` and `granted_by = auth.uid()`. DELETE: grantor, any member, or admin. No UPDATE (delete + re-insert). Add an `enforce`-style guard if you want to stop a guest inserting a grant for themselves — but the "not a guest" check on insert already prevents self-grant. |

**Storage (photos bucket):** photo *files* are served via signed URLs (`withSignedUrls()`), generated server-side after the `photos` row passes RLS — so the table policy is the gate. **Verify** the storage RLS / signed-URL path doesn't let a guest mint a URL for a non-granted property's object (check [20260523000005_photos_storage.sql](../supabase/migrations/20260523000005_photos_storage.sql) and the signing helper). If signed URLs are generated only for rows the caller can SELECT, you're covered; if not, add a guard.

**Implementation discipline:** do this as **one new migration** that `drop policy … ; create policy …` for each changed policy (keep names stable), plus the new functions and table. Every `is_guest()` call is `security definer` and `stable`, so Postgres caches it per statement — but still order predicates so the cheap `not is_guest()` short-circuits first.

### 3. Routing & gating (defense in depth, layer 2 + 3)

- **Middleware ([src/lib/supabase/middleware.ts](../src/lib/supabase/middleware.ts))**: after resolving `user`, if the user is a guest (look up role — see perf note below), **restrict allowed paths to a guest allow-list**: `/properties` (filtered), `/properties/[granted-slug]/*`, `/profile`, `/sign-out`, `/auth/*`, `/login`, Next internals. Any other top-level route (`/family`, `/admin`, `/calendar`, `/photos`, `/coming-soon/*`) → redirect to the guest's landing (their single property, or the filtered `/properties` list).
  - **Perf note**: the middleware runs on every request and the `@supabase/ssr` docs warn against running queries between `createServerClient` and `getUser()`. Fetch the role *after* `getUser()` returns. Cache the role in a short-lived cookie/JWT claim if the extra round-trip is a concern, or read it from `app_metadata` if you mirror role there. **Do not** add a DB query before `getUser()`.
- **`/properties` listing**: query already returns all properties; for a guest, filter to `is_property_guest`-true rows (RLS will already hide the rest, so the page naturally shows only granted ones). Then:
  - **0 granted** → an empty-state "You don't have access to any properties yet. Ask your host." (shouldn't happen if invites always carry a grant, but handle it).
  - **exactly 1 granted** → `redirect()` straight to `/properties/<slug>`.
  - **2+ granted** → render the scoped list.
- **Per-property page** ([src/app/(app)/properties/[slug]/page.tsx](../src/app/(app)/properties/[slug]/page.tsx) and nested routes): RLS makes a non-granted property return no row → `notFound()`. Add an explicit `can_view_property` check so the guest gets a clean 404, never a half-rendered shell. **Hide member-only affordances** (Edit, Add contact, Booking request form, admin links) when `is_guest()`.
- **App shell / nav** ([src/components/app-shell/site-header.tsx](../src/components/app-shell/site-header.tsx), `site-nav.tsx`): for guests, render a stripped nav — Properties + their profile + sign out only. No Family / Calendar / Admin / Photos links.
- **App layout** ([src/app/(app)/layout.tsx](../src/app/(app)/layout.tsx)): it already does `getUser()` + `is_admin()`. Add an `is_guest()` RPC and pass a `viewerRole` down so the shell and pages branch consistently.

### 4. Invitation flow

- Extend the admin/member invite UI: when inviting `role='guest'`, **require a property selection** (the grant). Option A stores `grant_property_id` on the invitation; `handle_new_user()` creates the `property_guests` row on first sign-in.
- Add a **member-facing grant entry point** (not just admin): a "Add a guest" affordance on the property page and/or the property's calendar, and ideally on a booking the member created ("link a guest to this stay" → auto-grant + `booking_id`). This is the family's primary mental model.
- A guest who already has a profile (e.g. previously hosted elsewhere) gets the grant immediately — no re-invite, just a new `property_guests` row.
- Reuse `sendInviteMagicLink` / `createInvitation` in [src/app/(app)/admin/actions.ts](../src/app/(app)/admin/actions.ts); a member-callable variant needs its own auth guard (member, not admin-only).

### 5. Properties-listing behavior (recap)

Filtered list for guests, 1 → redirect, 2+ → scoped list, 0 → empty state. Members/admins: unchanged (see all).

## Out of scope

- **Member-to-family-branch property scoping** (the broader "property access scoping" open decision). Members still see everything. Only guests are scoped here.
- **Guest booking requests** — guests view availability but don't request dates in v1. (If wanted later, relax the bookings insert guard + add UI.)
- **Guest-visible legacy/photos beyond a granted property** — legacy and profile/people photos stay family-only.
- **Granular per-field redaction beyond bookings** — properties are shown whole to a granted guest (no "hide the address from guests" toggle). Add later if a family member objects.
- **Notifications/emails** to guests beyond the invite magic link (consistent with the rest of the site today).
- **Multiple named/rotatable guest tokens, public share links** — guests authenticate normally via Supabase auth, same as members.
- **Time-boxed auto-revocation UI** — `expires_at` exists in the schema but the v1 UI may just offer manual revoke; wiring an expiry picker is optional.

## Security / RLS plan

**This section is the heart of the PRD. Treat the negative tests as acceptance criteria.**

### Layered defense

1. **RLS (the only real guarantee).** Every table policy in [20260523000002_rls.sql](../supabase/migrations/20260523000002_rls.sql) (+ bookings, people, property_admins, property_guests) is rewritten guest-aware per the [per-table table above](#2-rls--per-table-plan-the-heavy-part). This is what stops a guest hitting PostgREST/the REST API directly with their own JWT. **If only one layer existed, it must be this one.**
2. **Middleware route gating** (UX + early block): guests redirected off forbidden top-level routes ([middleware.ts](../src/lib/supabase/middleware.ts)).
3. **Per-page server checks** (UX, clean 404s): `can_view_property` / `is_guest` checks in Server Components so a guest never sees a broken shell; member-only affordances conditionally rendered.

### Helper functions (all `security definer`, `stable`, `set search_path = ''`, granted to `authenticated`)

- `is_guest()` — caller is a guest.
- `is_property_guest(uuid)` — caller holds an unexpired grant for this property.
- `can_view_property(uuid)` — member/admin OR granted guest (read-side analogue of `canManageProperty`).
- (reuse) `is_admin()`, `is_property_admin(uuid)`.

### Per-table policy changes (summary)

- **profiles**: SELECT `using (true)` → `using (not public.is_guest() or id = (select auth.uid()))`.
- **properties / property_contacts / photos**: SELECT `using (true)` → grant-scoped for guests (see table).
- **photo_subjects / people / revisions / property_admins**: SELECT → `not public.is_guest()` (hidden from guests).
- **bookings**: SELECT → `not public.is_guest() or requested_by = (select auth.uid())`; availability for guests served via a redacted `security definer` RPC, **not** by widening RLS.
- **property_guests** (new): member/admin read all, guest reads own; insert by non-guest members/admins with `granted_by = auth.uid()`; delete by grantor/member/admin.
- **No write policy anywhere should newly admit a guest.** Where a write policy is currently `using (true)` (properties wiki update, contacts), add `and not public.is_guest()` so a guest can never edit even by direct API call.

### Privilege-escalation checks (must all hold)

- A guest **cannot** change their own `role` (blocked by `guard_profile_privileged_columns`). Re-verify after the profiles policy change.
- A guest **cannot** self-grant a `property_guests` row (insert check excludes guests).
- A guest **cannot** read another profile, the directory, people, other properties, other bookings, revisions, or invitations — via UI *or* direct API.
- The **storage signed-URL** path must not leak non-granted property objects (see Storage note above).

## Likely file layout

```
supabase/migrations/
  YYYYMMDD000001_guest_access.sql   # property_guests table + is_guest()/is_property_guest()/can_view_property()
                                    # + DROP/CREATE every guest-aware SELECT policy + write guards
                                    # + (option A) invitations.grant_property_id + handle_new_user() update

src/lib/db/schema.ts                # mirror property_guests (+ invitations.grantProperty)
src/lib/property-auth.ts            # add canViewProperty(id) (read analogue of canManageProperty)
src/lib/guest.ts                    # isGuest(), guestPropertyIds(), guestLanding() helpers (server)

src/lib/supabase/middleware.ts      # guest route allow-list + redirect to guest landing
src/app/(app)/layout.tsx            # resolve viewerRole (admin|member|guest), pass to shell

src/components/app-shell/site-nav.tsx     # stripped nav for guests
src/components/app-shell/site-header.tsx  # hide member-only links for guests

src/app/(app)/properties/page.tsx                 # filter + (1→redirect / 2+→list / 0→empty)
src/app/(app)/properties/[slug]/page.tsx          # can_view_property gate; hide edit/book affordances
src/app/(app)/properties/[slug]/calendar/page.tsx # redacted busy/free view for guests
src/app/(app)/properties/[slug]/_components/...    # guest-grant ("Add a guest") affordance

src/app/(app)/admin/actions.ts      # guest invite variant (role=guest + grant); member-callable grant action
src/app/(app)/admin/page.tsx        # guest-grants management surface (optional v1)
```

(Adjust to taste — these match existing conventions, not commandments.)

## Verification recipe

Set up **three identities**: a site **admin**, a plain **member**, and a **guest** granted exactly one property (then later a second). Drive the guest in an incognito window. Run the **positive** path, then every **negative** test — the negatives are acceptance criteria.

**Positive (guest can do what they should):**
1. Admin (or member) invites `guest@example.com` with a grant to **Loon House**. Guest accepts the magic link → on first sign-in, a `property_guests` row exists for Loon House; guest lands **directly on `/properties/loon-house`** (single-property redirect).
2. Guest sees Loon House: name, how-to, contacts, photos attached to Loon House, and a **busy/free** calendar (no other names). No Edit, no Add-contact, no booking form, no admin links. Nav shows only Properties + profile + sign out.
3. Member grants the same guest a **second** property (Loon Cabin). Guest reloads `/properties` → sees **exactly two** properties, picks one. (No redirect now — 2+.)
4. Guest opens `/profile` → can read/edit **their own** profile only.

**Negative (guest is blocked — RLS + routing + API):**
5. Guest visits `/family` → **redirected** (not the directory). `/admin` → redirected. `/calendar` (unified) → redirected. `/photos` → redirected. `/coming-soon/timeline` → redirected.
6. Guest visits a **non-granted** property URL directly (`/properties/loon-a-see`) → **404 / not found**, never a rendered page.
7. **Direct API (the real test).** With the guest's access token, hit PostgREST directly and confirm RLS — *not just the UI* — blocks each:
   - `GET /rest/v1/profiles?select=*` → returns **only the guest's own row** (not the directory).
   - `GET /rest/v1/properties?select=*` → returns **only granted** properties.
   - `GET /rest/v1/property_contacts`, `/photos` → only granted-property rows; **no** profile-only/legacy photos.
   - `GET /rest/v1/people` → **empty**. `GET /rest/v1/revisions` → **empty**. `GET /rest/v1/bookings` → **only the guest's own rows** (no member bookings, names, or notes).
   - `GET /rest/v1/invitations` → **empty** (admin-only).
   - `POST /rest/v1/property_guests` self-granting another property → **denied**.
   - `PATCH /rest/v1/profiles?id=eq.<guest>` setting `role='member'` or `role='admin'` → **denied** (privileged-column guard).
   - `PATCH`/`POST` on `properties` / `property_contacts` (wiki edit) as the guest → **denied** (write guard).
8. **Member/admin regression** (didn't break the open model): member still reads all properties, the full directory, all bookings, people, revisions; admin still manages everything. Run the existing [PRD 06](06-property-booking.md) and [PRD 12](12-authoring-ux.md) verification recipes to confirm no member-facing regression.
9. **Storage**: as the guest, attempt to fetch a signed URL / object for a **non-granted** property's photo → denied / no URL minted.
10. **Revocation**: member revokes the Loon Cabin grant → guest reload shows only Loon House (back to single-property redirect); direct API for Loon Cabin rows now empty.
11. **Expiry** (if wired): set `expires_at` in the past on a grant → that property disappears for the guest immediately.
12. **Deactivated guest does NOT escalate** (regression guard for the `is_guest()` fix): deactivate a guest, then re-run the direct-API checks from step 7. They must **not** suddenly read all properties/profiles/people — a deactivated guest stays scoped (or is blocked entirely if you enforce deactivation at sign-in), and never gains member-level access.

## Implementation

**Not started.** (When you ship: fill this with the migration filename(s), the final per-table policy decisions, the deferred-grant option chosen (A or B), where the role lookup landed in middleware and its perf approach, the redacted-calendar RPC shape, any storage-RLS fix, and open follow-ups. Then flip the status header here to `✅ shipped` and update the chunk-status table in [prds/00-master-plan.md](00-master-plan.md).)
