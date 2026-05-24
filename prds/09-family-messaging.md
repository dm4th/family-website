# 09 — Family Messaging

**Phase**: 4 · **Depends on**: established active usage of the portal — only worth building if people actually live here

## Goal

Lightweight in-portal communication so families can coordinate things directly in context (e.g., comments on a property, a thread about a booking, a private DM). NOT trying to replace iMessage / WhatsApp.

> **Caution**: messaging features are sticky but also a notification firehose. Build only if the family is genuinely engaging with the portal and wants this. Otherwise, the time is better spent on property / RAG features.

## User stories

- As a member, I leave a comment on Loon Lake's property page asking "Is the canoe paddle in the boathouse?".
- As a beneficiary, I DM the trustee about a distribution question (private, audit-logged).
- As any member, I see a "What's new" feed of recent comments and uploads when I sign in.

## In scope (candidates)

- Entity comments — properties, profiles, photos can have a comment thread
- Direct messages between members (1:1 or small group)
- "What's new" activity feed on the dashboard
- Email digest (daily / weekly) summarizing activity

## Out of scope

- Real-time chat (WebSocket presence, typing indicators) — not necessary for a 25-person family
- Voice / video
- File attachments in DMs (just paste a link to the photo / file already in the system)
- Push notifications to mobile (native app territory)

## Open questions

- Email digest cadence default — daily? weekly? per-user opt-in?
- DM retention / deletion policy
- Moderation: do we need any? Probably not for ~25 family members, but think about it.

## References / reuse

- Supabase Realtime for live updates if needed (postpone — polling is fine)
- Same Resend setup for digest emails
