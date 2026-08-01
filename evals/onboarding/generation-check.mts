// Generation-suggestion checks (PRD 39, slice B).
//
// The tree step preselects a generation derived from where the member's chosen
// parents sit. PRD 39's reviewer sign-off asks that the suggestion "matches
// parent + 1 against the live data and never overrides an explicit member
// choice". The second half is a UI rule (the field stops following the
// suggestion the moment it's touched); this file covers the first half — the
// pure derivation — against a fixture shaped like the real family after the
// 2026-08-01 renumbering: Bibi and Drew are 1, their children are 2,
// grandchildren are 3.
//
// No database, no API key, no cost, so it can run on every change.
//
// Usage:
//   npx tsx evals/onboarding/generation-check.mts

import {
  generationOfPerson,
  suggestGeneration,
  type TreeEdge,
} from "@/lib/family-tree";

let failures = 0;
let checks = 0;

function check(label: string, ok: boolean, detail = "") {
  checks += 1;
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function eq(label: string, actual: unknown, expected: unknown) {
  check(label, actual === expected, `got ${actual}, expected ${expected}`);
}

// ---------------------------------------------------------------------------
// Fixture. Ids are readable on purpose; the helpers treat them as opaque.
// ---------------------------------------------------------------------------
const parent = (a: string, b: string): TreeEdge => ({
  id: `${a}->${b}`,
  personA: a,
  personB: b,
  type: "parent",
});
const spouse = (a: string, b: string): TreeEdge => ({
  id: `${a}~${b}`,
  personA: a,
  personB: b,
  type: "spouse",
});

const edges: TreeEdge[] = [
  spouse("bibi", "drew"),
  // Generation 2 — the three sibling families.
  parent("bibi", "peter"),
  parent("drew", "peter"),
  parent("bibi", "peggy"),
  parent("drew", "peggy"),
  parent("bibi", "andy"),
  parent("drew", "andy"),
  spouse("peter", "carol"),
  // Generation 3.
  parent("peter", "dan"),
  parent("carol", "dan"),
  // An ancestor branch nobody has recorded a generation for.
  parent("unknown_gran", "married_in"),
  spouse("dan", "married_in"),
];

// Only people with a linked profile carry a recorded generation, which in the
// live data is a minority of the tree — hence the walk.
const known = new Map<string, number>([
  ["bibi", 1],
  ["drew", 1],
  ["peter", 2],
]);

console.log("\nGeneration derivation (PRD 39)\n");

// --- generationOfPerson -----------------------------------------------------
eq("known person returns their own generation", generationOfPerson("peter", edges, known), 2);
eq("one step up from a known parent", generationOfPerson("dan", edges, known), 3);
eq("unknown parent, known grandparent", generationOfPerson("peggy", edges, known), 2);
eq(
  "nobody above has a generation",
  generationOfPerson("married_in", edges, known),
  null,
);
eq(
  "person absent from the graph entirely",
  generationOfPerson("stranger", edges, known),
  null,
);

// --- suggestGeneration ------------------------------------------------------
eq("no parents chosen leaves it unanswered", suggestGeneration([], edges, known), null);
eq("single known parent → parent + 1", suggestGeneration(["peter"], edges, known), 3);
eq(
  "two parents, only one placed",
  // Carol has no recorded generation and no ancestors in the fixture.
  suggestGeneration(["peter", "carol"], edges, known),
  3,
);
eq(
  "grandparent-only ancestry still resolves",
  suggestGeneration(["peggy"], edges, known),
  3,
);
eq(
  "unplaceable parents leave it unanswered",
  suggestGeneration(["married_in"], edges, known),
  null,
);
eq(
  "nearest-to-the-top parent wins",
  // A stub parent with deep ancestry must not drag the answer below the
  // parent we can actually place.
  suggestGeneration(["peter", "dan"], edges, known),
  3,
);

// --- robustness -------------------------------------------------------------
// A malformed graph must not hang the welcome page. Two people recorded as each
// other's parent is nonsense, but nonsense should terminate.
const cyclic: TreeEdge[] = [parent("a", "b"), parent("b", "a")];
eq("cycle terminates", generationOfPerson("a", cyclic, new Map()), null);

// Spouse edges are not a path to a generation: marrying someone in generation 2
// does not make you generation 3.
eq(
  "spouse edges are not walked",
  generationOfPerson("carol", [spouse("peter", "carol")], known),
  null,
);

console.log(
  `\n${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ""}\n`,
);
process.exit(failures ? 1 : 0);
