/**
 * The standard result shape an authoring Server Action returns, shared by
 * InlineEditable and CreateFlow. Matches the existing app convention
 * (PropertyFormState / ProfileFormState) so actions drop in unchanged.
 */
export type SaveState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; message: string };

export const idleState: SaveState = { status: "idle" };
