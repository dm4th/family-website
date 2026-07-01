// Family Tree — pure, framework-free helpers shared by the server pages (which
// fetch the data) and the client tree view (which lays it out). No React and no
// server-only imports live here, so both sides can derive relatives and format
// lifespans identically.
//
// The graph is tiny (a few dozen people), so every derivation is a plain scan
// over the edge list — no adjacency index, no memoization needed.

/** A person node as the tree renders it — a projection of the `people` row. */
export type TreePerson = {
  id: string;
  displayName: string;
  givenName: string | null;
  familyName: string | null;
  birthDate: string | null;
  birthCirca: string | null;
  deathDate: string | null;
  deathCirca: string | null;
  familyBranch: string | null;
  /** Non-null ⇒ a living member with a site login (links to their directory profile). */
  profileId: string | null;
};

/** A directed/undirected edge, mirroring the `relationships` row. */
export type TreeEdge = {
  id: string;
  personA: string;
  personB: string;
  type: "parent" | "spouse";
};

/** Deceased (an exact death date or an approximate one) ⇒ in-memoriam treatment. */
export function isInMemoriam(p: TreePerson): boolean {
  return p.deathDate != null || (p.deathCirca?.trim().length ?? 0) > 0;
}

/** True for a person who has a site login (a linked `profiles` row). */
export function isMember(p: TreePerson): boolean {
  return p.profileId != null;
}

/** Pull a 4-digit year out of an ISO date or a fuzzy phrase ("circa 1972"). */
function yearOf(exact: string | null, circa: string | null): string | null {
  if (exact) {
    const m = /^(\d{4})/.exec(exact);
    if (m) return m[1]!;
  }
  if (circa) {
    const m = /(\d{4})/.exec(circa);
    if (m) return m[1]!;
    const t = circa.trim();
    if (t) return t; // a non-year phrase ("summer") — show it verbatim
  }
  return null;
}

/**
 * A reverent one-line lifespan: "1912 – 1998", "c. 1880 – 1932", "b. 1945",
 * "d. 1998", or "" when nothing is known. A leading "c." marks any approximate
 * bound. Uses an en dash (allowed in dates), not an em dash.
 */
export function lifespan(p: TreePerson): string {
  const birth = yearOf(p.birthDate, p.birthCirca);
  const death = yearOf(p.deathDate, p.deathCirca);
  const birthApprox = !p.birthDate && !!p.birthCirca;
  const deathApprox = !p.deathDate && !!p.deathCirca;

  const b = birth ? `${birthApprox ? "c. " : ""}${birth}` : null;
  const d = death ? `${deathApprox ? "c. " : ""}${death}` : null;

  if (b && d) return `${b} – ${d}`;
  if (b) return `b. ${b}`;
  if (d) return `d. ${d}`;
  return "";
}

/** The relatives of a focus person, each as a list of person ids (deduped). */
export type Relatives = {
  parents: string[];
  children: string[];
  spouses: string[];
  siblings: string[];
};

/**
 * Derive a focus person's immediate relatives from the edge list. Siblings are
 * computed (anyone sharing a parent), never stored. All results are deduped and
 * exclude the focus person.
 */
export function deriveRelatives(focusId: string, edges: TreeEdge[]): Relatives {
  const parents = new Set<string>();
  const children = new Set<string>();
  const spouses = new Set<string>();

  for (const e of edges) {
    if (e.type === "parent") {
      if (e.personB === focusId) parents.add(e.personA);
      if (e.personA === focusId) children.add(e.personB);
    } else if (e.type === "spouse") {
      if (e.personA === focusId) spouses.add(e.personB);
      if (e.personB === focusId) spouses.add(e.personA);
    }
  }

  // Siblings: everyone who shares at least one parent with the focus person.
  const siblings = new Set<string>();
  for (const e of edges) {
    if (e.type === "parent" && parents.has(e.personA) && e.personB !== focusId) {
      siblings.add(e.personB);
    }
  }

  return {
    parents: [...parents],
    children: [...children],
    spouses: [...spouses],
    siblings: [...siblings],
  };
}
