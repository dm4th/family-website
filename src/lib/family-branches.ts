/**
 * The family branches — the three Gen-1 siblings. Stored on
 * profiles.family_branch as free text historically; the format here
 * ("<Name>'s Family") matches the seeded `people` / `profiles` rows so a
 * dropdown selection reconciles with existing data (PRD 13, slice 2).
 *
 * Kept as a constant because there are three of them today. If branches
 * multiply as the family grows, promote this to a `family_branches` reference
 * table — every consumer reads from here, so that's a one-file change.
 */
export const FAMILY_BRANCHES = [
  "Peter's Family",
  "Andy's Family",
  "Peggy's Family",
] as const;

export type FamilyBranch = (typeof FAMILY_BRANCHES)[number];
