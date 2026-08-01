/**
 * Generation labels + the shared onboarding/edit hint (PRD 13, slice 13-R2).
 *
 * Mirrors family-branches.ts: ONE source for everything that renders a
 * generation, so the directory grouping, the /welcome flow, profile-edit, and
 * the admin roster can never drift. Before this, the label map lived inline in
 * the directory, the edit form had its own hint, and admin rendered "Gen N"
 * ad-hoc.
 *
 * Numbering is the family's own scheme, anchored at the top of the tree
 * (Dad's call, 2026-08-01): 1 = Bibi (Helen) and Drew, 2 = their children and
 * spouses (Peter, Peggy, and Andy), 3 = grandchildren and spouses, and so on
 * down. Kept as a constant because there are a handful today; if the family
 * outgrows it, widen GENERATIONS here and every consumer follows.
 */
export const GENERATIONS = [1, 2, 3, 4, 5] as const;

export type Generation = (typeof GENERATIONS)[number];

// Title Case to match the directory's existing rendering — centralizing these
// is a behavior-preserving de-dupe; the casing sweep is its own slice (PRD 16).
const GENERATION_LABEL: Record<number, string> = {
  1: "First Generation",
  2: "Second Generation",
  3: "Third Generation",
  4: "Fourth Generation",
  5: "Fifth Generation",
};

/** Directory-style label, e.g. "Third generation". Falls back gracefully. */
export function generationLabel(generation: number): string {
  return GENERATION_LABEL[generation] ?? `Generation ${generation}`;
}

/** Compact label for dense tables, e.g. "Gen 3". */
export function generationShort(generation: number): string {
  return `Gen ${generation}`;
}

/**
 * Who each generation is, in the family's own words. Rendered inside the
 * generation picker so nobody has to guess a number, and available anywhere
 * else a reminder helps. First names in code match the precedent set by
 * FAMILY_BRANCHES.
 */
const GENERATION_ANCHOR: Record<number, string> = {
  1: "Bibi and Drew",
  2: "Their children and spouses",
  3: "Grandchildren and spouses",
  4: "Great-grandchildren",
  5: "Great-great-grandchildren",
};

/** "Bibi and Drew"-style anchor for a generation, or null past the known set. */
export function generationAnchor(generation: number): string | null {
  return GENERATION_ANCHOR[generation] ?? null;
}

/** Shown in the directory when a member has no generation set. */
export const GENERATION_UNSET_LABEL = "Generation Not Set";

/** Hint shown under the generation control on the welcome + edit forms. */
export const GENERATION_HINT =
  "Count down from the top of the tree: Bibi and Drew are 1, their children and spouses (Peter, Peggy, and Andy) are 2, grandchildren are 3, great-grandchildren are 4.";

/**
 * Validate a raw form value for `generation`. Returns the parsed integer, or
 * `null` when blank. Throws a caller-friendly message when present but invalid,
 * so onboarding and profile-edit share one rule.
 */
export function parseGeneration(raw: string | null): number | null {
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) {
    throw new Error("Generation must be a small whole number (1, 2, 3, …).");
  }
  return parsed;
}
