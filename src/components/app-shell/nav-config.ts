// Single source of truth for the family-office navigation *structure*, shared by
// the top nav (desktop dropdowns + mobile accordion) and the homepage mode
// doors. Each group is a page mode — the design system's emotional zoning made
// navigable. Adding a route later means appending an item to its mode, not
// spawning another top-level tab.
//
// The nav and the homepage read this same shape so they can never drift: the
// dropdown under "Family" and the "Family" door on the homepage list the same
// pages, in the same order, tinted the same mode accent.

export type NavMode = "family" | "operations" | "advisory";

export type NavCountKey =
  | "members"
  | "properties"
  | "albums"
  | "people"
  | "events"
  | "stories";

export type NavItem = {
  label: string;
  href: string;
  description: string;
  /** Which homepage count feeds this item's badge, if any. */
  countKey?: NavCountKey;
  /** [singular, plural] noun used when rendering the badge. */
  unit?: [string, string];
  /**
   * Not yet built. Shown as a muted "Soon" item on the homepage door and
   * omitted entirely from the top nav (which lists reachable pages only).
   */
  soon?: boolean;
  /** Only admins see this destination anywhere. */
  adminOnly?: boolean;
};

export type NavGroupDef = {
  mode: NavMode;
  /** Title Case group label — the door heading and the dropdown trigger. */
  label: string;
  /** One-line summary shown beneath the door heading on the homepage. */
  blurb: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroupDef[] = [
  {
    mode: "family",
    label: "Family",
    blurb:
      "Everyone in the family, the archive of who we are, and the stories that connect us.",
    items: [
      {
        label: "Directory",
        href: "/family",
        description: "Profiles and generations",
        countKey: "members",
        unit: ["member", "members"],
      },
      {
        label: "Archive",
        href: "/family/archive",
        description: "Historical photos and albums",
        countKey: "albums",
        unit: ["album", "albums"],
      },
      {
        label: "Family Tree",
        href: "/family/tree",
        description: "Generations and how they connect",
        countKey: "people",
        unit: ["person", "people"],
      },
      {
        label: "Timeline",
        href: "/family/timeline",
        description: "The family story, year by year",
        countKey: "events",
        unit: ["event", "events"],
      },
      {
        label: "Stories",
        href: "/family/stories",
        description: "Memories in the family's words",
        countKey: "stories",
        unit: ["story", "stories"],
      },
      {
        label: "Messaging",
        href: "/coming-soon/messaging",
        description: "In-context comments and a what's-new feed",
        soon: true,
      },
    ],
  },
  {
    mode: "operations",
    label: "Operations",
    blurb: "The family's shared places, and the calendar that keeps them running.",
    items: [
      {
        label: "Properties",
        href: "/properties",
        description: "Homes and stewardship",
        countKey: "properties",
        unit: ["place", "places"],
      },
      {
        label: "Calendar",
        href: "/calendar",
        description: "Bookings across properties",
      },
    ],
  },
  {
    mode: "advisory",
    label: "Advisory",
    blurb: "Governance, trust, and finances. The family's stewardship desk.",
    items: [
      {
        label: "Admin",
        href: "/admin",
        description: "Roster, invitations, and governance",
        adminOnly: true,
      },
      {
        label: "Documents & AI",
        href: "/coming-soon/documents",
        description: "Plain-language answers from trust documents",
        soon: true,
      },
      {
        label: "Finances",
        href: "/coming-soon/finances",
        description: "Trust performance and distributions, transparently",
        soon: true,
      },
    ],
  },
];

export const modeAccentRail: Record<NavMode, string> = {
  family: "bg-accent-family",
  operations: "bg-accent-operations",
  advisory: "bg-accent-advisory",
};

export const modeAccentText: Record<NavMode, string> = {
  family: "text-accent-family",
  operations: "text-accent-operations",
  advisory: "text-accent-advisory",
};

export const modeAccentSoft: Record<NavMode, string> = {
  family: "bg-accent-family-soft",
  operations: "bg-accent-operations-soft",
  advisory: "bg-accent-advisory-soft",
};

/**
 * Items reachable in the *top nav*: built pages only (no `soon`), with
 * admin-only destinations hidden from non-admins. Used for the desktop
 * dropdowns and the mobile accordion.
 */
export function navItemsForViewer(group: NavGroupDef, isAdmin: boolean): NavItem[] {
  return group.items.filter(
    (item) => !item.soon && (!item.adminOnly || isAdmin)
  );
}

/**
 * Groups that should render a top-nav trigger for this viewer — i.e. those
 * with at least one reachable page. (Advisory collapses away for non-admins,
 * since its only built page is Admin.)
 */
export function navGroupsForViewer(isAdmin: boolean): NavGroupDef[] {
  return NAV_GROUPS.filter((group) => navItemsForViewer(group, isAdmin).length > 0);
}

/**
 * Items shown on the *homepage door*: admin-only destinations hidden from
 * non-admins, but `soon` pages kept (rendered muted) so the mode's full shape
 * is legible even before every page exists.
 */
export function doorItemsForViewer(group: NavGroupDef, isAdmin: boolean): NavItem[] {
  return group.items.filter((item) => !item.adminOnly || isAdmin);
}

/** Active-state test shared by the nav and any "you are here" affordance. */
export function isPathActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** True when the current path lives inside any of a group's reachable pages. */
export function isGroupActive(
  pathname: string,
  group: NavGroupDef,
  isAdmin: boolean
): boolean {
  return navItemsForViewer(group, isAdmin).some((item) =>
    isPathActive(pathname, item.href)
  );
}
