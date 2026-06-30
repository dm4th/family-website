/**
 * Generation labels + the shared onboarding/edit hint (PRD 13, slice 13-R2).
 *
 * Mirrors family-branches.ts: ONE source for everything that renders a
 * generation, so the directory grouping, the /welcome flow, profile-edit, and
 * the admin roster can never drift. Before this, the label map lived inline in
 * the directory, the edit form had its own hint, and admin rendered "Gen N"
 * ad-hoc.
 *
 * Numbering is the family's own scheme: 1 = the founding siblings, then each
 * descending generation. Kept as a constant because there are a handful today;
 * if the family outgrows it, widen GENERATIONS here and every consumer follows.
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

/** Shown in the directory when a member has no generation set. */
export const GENERATION_UNSET_LABEL = "Generation Not Set";

/** Hint shown under the generation control on the welcome + edit forms. */
export const GENERATION_HINT =
  "1 = siblings, 2 = grandchildren + spouses, 3 = great-grandchildren.";

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
