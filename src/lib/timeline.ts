// Family Timeline — pure, framework-free helpers shared by the server page (which
// fetches + signs) and the client view (which groups, filters, and renders). No
// React, no server imports. The dataset is small, so grouping is a plain sort.

export type TimelinePerson = {
  id: string;
  displayName: string;
  familyBranch: string | null;
  inMemoriam: boolean;
};

export type TimelinePhoto = {
  id: string;
  signedUrl: string;
  fallbackUrl: string | null;
  caption: string | null;
};

/** One entry on the timeline — either a narrative event or a dated archive photo. */
export type TimelineItem = {
  id: string;
  kind: "event" | "photo";
  year: number;
  /** Sortable within a year: an ISO date when known, else "" (undated → last). */
  sortDate: string;
  dateLabel: string;
  title: string | null;
  description: string | null;
  location: string | null;
  people: TimelinePerson[];
  photos: TimelinePhoto[];
};

/** Pull a 4-digit year out of an ISO date or a fuzzy phrase ("summer 1968"). */
export function parseYear(exact: string | null, circa: string | null): number | null {
  if (exact) {
    const m = /^(\d{4})/.exec(exact);
    if (m) return Number(m[1]);
  }
  if (circa) {
    const m = /(\d{4})/.exec(circa);
    if (m) return Number(m[1]);
  }
  return null;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "July 4, 1968" for an exact date, the circa phrase for a fuzzy one, else the year. */
export function dateLabel(
  exact: string | null,
  circa: string | null,
  year: number,
): string {
  if (exact) {
    const [y, m, d] = exact.split("-").map(Number);
    if (y && m && d && MONTHS[m - 1]) return `${MONTHS[m - 1]} ${d}, ${y}`;
  }
  if (circa && circa.trim()) return circa.trim();
  return String(year);
}

export const decadeOf = (year: number): number => Math.floor(year / 10) * 10;

/** Group items into year sections, newest year first; within a year, dated
 * entries ascending (undated last). */
export function groupByYear(
  items: TimelineItem[],
): { year: number; items: TimelineItem[] }[] {
  const byYear = new Map<number, TimelineItem[]>();
  for (const it of items) {
    const list = byYear.get(it.year) ?? [];
    list.push(it);
    byYear.set(it.year, list);
  }
  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, list]) => ({
      year,
      items: list.sort((a, b) => {
        // Undated (sortDate "") sinks to the bottom of the year.
        if (a.sortDate && b.sortDate) return a.sortDate.localeCompare(b.sortDate);
        if (a.sortDate) return -1;
        if (b.sortDate) return 1;
        return 0;
      }),
    }));
}

/** Decade → years present, for the jump rail. Both sorted newest-first. */
export function buildDecades(
  years: number[],
): { decade: number; years: number[] }[] {
  const byDecade = new Map<number, Set<number>>();
  for (const y of years) {
    const d = decadeOf(y);
    const set = byDecade.get(d) ?? new Set<number>();
    set.add(y);
    byDecade.set(d, set);
  }
  return [...byDecade.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([decade, set]) => ({
      decade,
      years: [...set].sort((a, b) => b - a),
    }));
}

/** Does an item pass the active filter? A person filter wins over a branch one. */
export function matchesFilter(
  item: TimelineItem,
  filter: { personId: string | null; branch: string | null },
): boolean {
  if (filter.personId) {
    return item.people.some((p) => p.id === filter.personId);
  }
  if (filter.branch) {
    return item.people.some((p) => p.familyBranch === filter.branch);
  }
  return true;
}
