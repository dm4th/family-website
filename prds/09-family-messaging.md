# 09 — Family Messaging

**Phase**: 4 · **Depends on**: established active usage of the portal
**Status**: 🟡 hold. Don't build until the family is genuinely engaging with the portal day-to-day — otherwise it's an empty room. Re-evaluate after 2-3 months of real usage.

## Onboarding (read first if you're picking this up cold)

1. **Read** [CLAUDE.md](../CLAUDE.md), [prds/00-master-plan.md](00-master-plan.md), then this file.
2. **Sanity check the "hold" status** — before writing code, look at the portal's activity (photo uploads, property edits, sign-ins) over the past month. If it's flat, building messaging on top of dead infrastructure won't help; instead push for the underlying-engagement work.
3. **You will reuse**:
   - Auth + RLS for all access control
   - `recordRevision()` is overkill here — comments are themselves the history; use a soft-delete pattern (`deleted_at`) instead
   - Resend (if added by then) for digest emails — otherwise piggyback on Supabase magic-link emails or skip notifications for v1
4. **Skills**: `.agents/skills/supabase` covers the Realtime client setup if you decide to add live updates.

## Goal

Lightweight in-portal communication so families can coordinate things directly in context. NOT trying to replace iMessage / WhatsApp.

## User stories

- As a member, I leave a comment on Loon-A-See's property page asking "Is the canoe paddle in the boathouse?"
- As a beneficiary, I DM the trustee about a distribution question (private, audit-logged)
- As any member, I see a "What's new" feed of recent comments and uploads when I sign in
- As any member, I get a weekly email digest of activity I might have missed

## Pre-flight decisions (decide before code)

| Decision | Recommendation | Why |
|---|---|---|
| **Scope: comments first, DMs later?** | Yes — ship entity comments first | Comments are clearly useful in context. DMs are a bigger UX investment. |
| **Polling vs. Realtime** | Polling on dashboard refresh; Realtime only if someone complains | 23 people don't need WebSocket presence. |
| **Notification cadence** | Weekly digest default, daily opt-in | Don't spam. Most family activity is low-urgency. |
| **Moderation** | None for v1 | ~25 family members; trust is implicit. Add if abuse appears. |
| **Comment editing** | Edit own comments for 24h; soft-delete (`deleted_at` + replacement text "[deleted]") otherwise | Easy to reason about; protects against rage-edits while preserving thread coherence. |
| **DM retention** | Indefinite for v1 | Add user-controlled deletion if a member asks. |

## In scope (candidates — pick 1-2 to ship first)

- Entity comments — properties, profiles, photos can have a comment thread (one `comments` table with `entity_type` + `entity_id`)
- "What's new" activity feed on the dashboard (recent comments + photo uploads + property edits)
- Email digest (weekly default, configurable per-user)
- Direct messages between members (1:1 or small group) — **defer to v2 unless explicit request**

## Out of scope

- Real-time chat (WebSocket presence, typing indicators)
- Voice / video
- File attachments in DMs (just paste a link to the photo / file already in the system)
- Push notifications to mobile (native app territory)
- Threaded replies (flat comments only for v1)

## Likely file layout

```
supabase/migrations/
  YYYYMMDD_comments.sql            # comments table + indexes + RLS
src/lib/db/schema.ts               # mirror

src/components/comment-thread.tsx  # reusable thread + reply form
src/app/(app)/comments/
  actions.ts                       # addComment, editComment, deleteComment

src/app/(app)/page.tsx             # extend dashboard with "What's new" section
src/app/(app)/activity/
  page.tsx                         # full-page activity feed (optional)
```

Property and profile pages render `<CommentThread entityType="property" entityId={...} />`.

## Verification recipe

1. Open a property page, leave a comment. → appears immediately to other family members.
2. Edit it within 24h. → edit succeeds.
3. Delete it. → renders as "[deleted by N]" but the position in the thread is preserved.
4. Sign in fresh the next day. → "What's new" shows recent activity since your last sign-in.
5. Email digest fires on the configured cadence; contains a working link back to each item.
6. RLS check: try to fetch comments via raw API without auth. → 0 rows.

## References / reuse

- Supabase Realtime for live updates if needed (postpone — polling is fine for v1)
- Same Resend setup for digest emails (or piggyback on Supabase magic-link template)

## Implementation

_To be filled in by the contributor who ships this. Sanity-check the "hold" status first — don't build if the portal isn't actively used._

- **Status**: held pending portal-engagement validation
- **Key files**: (list once shipped)
- **Decisions made during build**:
- **Open follow-ups**:
