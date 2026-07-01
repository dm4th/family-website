# 19 — Shell Navigation & Home Restructure

**Phase**: 5 · **Depends on**: nothing new — restructures shipped surfaces (`site-nav.tsx`, homepage). Related to 16 (UI polish) and the mode system.
**Status**: 🚧 in review — built + PR opened 2026-07-01. Small–medium. Its own session/branch (touches the shared shell on every page).

---

## Why this exists

The top nav and homepage were designed when each mode had one or two destinations. Family Legacy changed that: the **Family** group alone now has five pages (Directory, Archive, Tree, Timeline, Stories), on top of Operations (Properties, Calendar) and Home. The result is a flat bar and a homepage with too many equal-weight entry points — **overwhelming, especially for the eldest generation**, who are the most important audience for the Legacy content. Dan flagged this directly (2026-07-01).

The design system already *thinks* in three modes (Family / Operations / Advisory). This PRD surfaces that structure in the navigation instead of listing every leaf page at once.

## Goal

An older family member lands on the homepage and sees **three calm doors** (Family / Operations / and later Advisory), not a wall of links; and the top nav collapses each mode's pages into a **grouped dropdown** tinted with that mode's accent. Fewer decisions per screen, clear hierarchy, one dominant moment per viewport — the family-office-ui non-negotiables.

## Onboarding (read first if you're picking this up cold)

1. **Read** [CLAUDE.md](../CLAUDE.md), [00-master-plan.md](00-master-plan.md), then this file, then **run the `family-office-ui` and `page-mode-orchestrator` skills** — this is a pure design/shell change and those skills are the rulebook.
2. **Read [AGENTS.md](../AGENTS.md)** before adding anything — Next 16 / React 19. Prefer the **shadcn `NavigationMenu`** primitive (radix, already in `src/components/ui/` or addable from our owned shadcn source) over a new dependency.
3. **You will reuse**: `src/components/app-shell/site-nav.tsx` (the nav), `src/components/user-menu.tsx`, the homepage gateway components in `src/app/(app)/page.tsx`, the mode accent tokens in `globals.css` (burgundy/forest/teal), and the existing guest-nav gating (guests see a stripped nav — do not regress this).

## Pre-flight decisions (decide before code)

| Decision | Recommendation | Why |
|---|---|---|
| **Nav pattern** | Mode = a **dropdown trigger** (`NavigationMenu`) listing that mode's pages; Home stays a flat link | Groups the five Family pages behind one door; scales to Advisory later. |
| **Accent** | Each dropdown + its active state uses the **mode accent** (Family burgundy / Operations forest / Advisory teal) | Reinforces emotional zoning; the color *is* the wayfinding. |
| **Mobile** | Dropdowns collapse to an **accordion inside the mobile menu/sheet**, not hover menus | Hover menus don't exist on touch; the eldest audience is on iPads. |
| **Active state** | Highlight the parent mode when you're on any page inside it, and the leaf in the open menu | "Where am I" must survive the grouping. |
| **Homepage** | **Three mode gateways** as the dominant module; within each, a short list (or a lead + "more") of its pages — not every leaf shown flat | One dominant moment per viewport; calm for older users. |
| **Advisory** | Build the group **structure** now (even if it holds only Admin today) so it's ready when 07/08 land | Avoids re-plumbing the nav later. |
| **A11y** | Full keyboard + focus + `aria` on the menus (radix `NavigationMenu` gives most of this) | Older users + accessibility are first-class here. |

## In scope
- **Grouped top nav**: Family / Operations / (Advisory) dropdown triggers over `NavigationMenu`, each listing its pages, mode-accent-tinted, with correct active state. Home remains a direct link; the wordmark stays a clickable home affordance.
- **Guest-safe**: guests continue to see their stripped nav (their one property, no Family/Operations/Admin groups). The grouping logic must branch on the viewer role exactly as today.
- **Mobile menu**: the same groups as an accordion in the existing mobile sheet; large tap targets.
- **Homepage restructure**: lead with the three mode gateways as the dominant module; each gateway summarizes its mode and links into it (lead page + "more", not a flat dump of all leaves). Keep it editorial — one dominant moment, per family-office-ui.
- **Admin link** folds into the Advisory group (or stays in the user menu) — pick one consistently.

## Out of scope (initial)
- Any new page or feature — this is restructuring existing destinations only.
- Search (a separate future idea).
- Per-branch nav customization.
- Changing the mode accents or shell primitives themselves.

## Verification recipe
1. **Desktop nav** — Family shows a burgundy-tinted dropdown of its 5 pages; Operations a forest one; open one, navigate, confirm the parent mode stays highlighted on the destination page.
2. **Older-user read** — the homepage shows three clear doors, not a link wall; a first-time visitor can tell where "the old family photos" live in one glance.
3. **Mobile/iPad** — the mobile menu groups the same pages as accordions; every target is comfortably tappable; nothing overflows.
4. **Guest** — sign in as a guest: nav still shows only their property, no Family/Operations/Advisory groups leaked.
5. **Keyboard** — tab to a mode trigger, open with Enter/Space, arrow through items, Esc closes; focus is visible throughout.
6. **Theme** — light/dark both clean across the new menus and homepage.

## Likely file layout

```
src/components/app-shell/site-nav.tsx        # grouped NavigationMenu (desktop) + accordion (mobile)
src/components/ui/navigation-menu.tsx        # shadcn primitive (add from our owned source if absent)
src/app/(app)/page.tsx                        # homepage → three mode gateways as dominant module
# possibly: a small nav config (mode → [pages]) shared by desktop + mobile + homepage
```

## References / reuse
- `src/components/app-shell/site-nav.tsx` — the nav being restructured
- `src/components/user-menu.tsx` — where Admin currently lives
- `src/app/(app)/page.tsx` — the Family/Operations gateways to consolidate
- `globals.css` mode accent tokens; `.claude/skills/family-office-ui` + `page-mode-orchestrator` — the visual rulebook
- Guest-nav gating already in `site-nav.tsx` (do not regress)

## Implementation

- **Status**: built + PR opened 2026-07-01. Pending review/merge. Design-only; no DB/route/dep changes (`radix-ui` `NavigationMenu` already available via the installed unified `radix-ui` package). `tsc` + `eslint` + `next build` all green.

- **Key files**:
  - `src/components/app-shell/nav-config.ts` — **new** single source of truth for the nav *structure* (mode → items), shared by the top nav (desktop + mobile) and the homepage doors so they can never drift. Exports the `NAV_GROUPS` config, mode-accent class maps, and the viewer-filtering + active-state helpers (`navGroupsForViewer`, `navItemsForViewer`, `doorItemsForViewer`, `isPathActive`, `isGroupActive`).
  - `src/components/ui/navigation-menu.tsx` — **new** shadcn `NavigationMenu` primitive (radix, unified `radix-ui` import, our tokens: `popover` / `shadow-panel` / `ring`). Keyboard + focus + `aria` come from radix.
  - `src/components/app-shell/site-nav.tsx` — rewritten. Desktop: Home stays a flat link; each mode is a `NavigationMenuTrigger` dropdown (`viewport={false}`, so each menu sizes to its own content) tinted with its mode accent, active parent underlined, active leaf highlighted in mode-soft. Mobile: same groups as a lightweight React accordion inside the existing sheet; the group holding the current page starts expanded; large tap targets.
  - `src/app/(app)/page.tsx` — homepage restructured from a flat 7-gateway grid into **three calm mode doors** (Family / Operations / Advisory), each a heading + blurb + its page list with count badges; unbuilt pages render as muted "Soon" rows (Messaging under Family; Documents & Finances under Advisory) instead of a separate "In flight" section. Counts feed the badges; the door heading links to the mode's lead page.
  - `src/components/app-shell/site-header.tsx` — threads `isAdmin` into `SiteNavDesktop`/`SiteNavMobile`.
  - `src/components/user-menu.tsx` — removed the Governance/Admin block (see decision below).

- **Decisions made during build**:
  - **Admin folds into the Advisory group** (nav + homepage door), removed from the user menu — "pick one consistently" resolved toward the mode structure. The Advisory top-nav trigger therefore only renders for admins (its sole built page is Admin); it collapses away entirely for non-admins via `navGroupsForViewer`.
  - **Coming-soon lives inside the doors, not a separate section.** Folding Messaging/Documents/Finances into their mode doors as muted "Soon" rows keeps the homepage to one dominant module (the three doors) instead of two competing sections.
  - **Guest gating unchanged.** It lives in `site-header.tsx` (`!isGuest && <SiteNav… />`), not inside the nav — guests still see no mode groups, only the wordmark → their property. (The PRD's note that the gating lives *in* `site-nav.tsx` was slightly off; it's at the header level and was preserved there.)
  - **`viewport={false}`** on the desktop `NavigationMenu` so each mode's dropdown anchors under its own trigger and sizes independently (2-item Operations vs 5-item Family), rather than a single shared morphing viewport.

- **Open follow-ups**:
  - Interactive verification recipe steps (keyboard traversal, live guest session, iPad tap-target check, light/dark sweep) were **not** run in the build session (auth-gated shell, non-interactive) — worth a quick pass by Dan before/after merge.
  - When Advisory pages land (07 Documents, 08 Finances), just flip their `soon` flags off in `nav-config.ts` — the nav trigger and door rows light up automatically.
