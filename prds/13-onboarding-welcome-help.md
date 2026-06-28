# 13 — In-app Welcome & Help (family onboarding)

**Phase**: 2.5 (adoption) · **Depends on**: a testing pass (see [docs/testing-playbook.md](../docs/testing-playbook.md))
**Status**: 🟡 hold — **decided, not yet started.** The family readout will be delivered **in-app** (a first-login welcome + a `/help` page), and we build it **after** a testing pass so it documents the app as it actually feels and after the worst rough edges are smoothed. Pick this up once the playbook's gap log comes back.

---

## Why

The site is opening to the whole family — multi-generational, eldest-generation-first. They need orientation, and the most reliable place for it is **inside the app**, where it's always available (not a PDF that gets lost in email). Decided over a written guide/video because it lives where they need it.

## Goal

A family member logging in for the first time understands, in under a minute, what the site is for and how to do the four things that matter: **find people, look after a property, book a stay, add a photo** — without reading a manual.

## Likely shape (decide during build)

- **First-login welcome** — a dismissible welcome panel/sheet on the dashboard for new members (gate on a `profiles.onboarded_at` flag or similar). Warm, short, Family-mode (`SalonPanel`), one clear "here's where to start."
- **`/help` page** — an always-available plain-language guide: logging in (magic links), editing your profile, the directory, properties + wiki editing, booking + calendar subscribe, photos. Written for the eldest generation — short, visual, no jargon (reuse the de-jargon pass already done on family-facing copy — see [[legacy-and-authoring-direction]]).
- **Contextual nudges** (optional) — a one-line "new here? how this works" on the first visit to the calendar / a property edit.

## Pre-flight decisions

| Decision | Lean | Why |
|---|---|---|
| Welcome dismissal state | `profiles.onboarded_at timestamptz` (null = show) | One column, RLS-trivial, lets us re-show after big changes. |
| Help content source | Markdown rendered via the existing `Markdown` component | Same renderer as everywhere; easy for the family to suggest edits later. |
| Tone | Plain, warm, eldest-gen-first; no dev/product jargon | Consistent with the family-facing copy pass. |
| Scope of v1 | Welcome panel + `/help`; skip contextual nudges until asked | Ship the high-reach pieces first. |

## Depends on (feed this in before/with the build)

- **Testing-pass gap log** — [docs/testing-playbook.md](../docs/testing-playbook.md). The guide should reflect a smoothed app; don't document known rough edges (e.g. "check the site for booking approvals" implies a missing notification — fix or call it out honestly).
- Whatever adoption-blocking gaps the testing pass surfaces (notifications and first-run orientation are the prime suspects) may jump ahead of this in the queue.

## Verification recipe

1. New member's first login → welcome panel appears; dismiss it → it stays gone (across reloads/devices via the flag).
2. `/help` reachable from the user menu and the welcome panel; readable on an iPad; no jargon.
3. Existing members don't see the welcome panel.

## Implementation

_Not started. Build after the testing pass; fill in here when shipped._
