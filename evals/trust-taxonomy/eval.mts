// Trust taxonomy eval (PRD 40 slice 2).
//
// Two questions, matching the two ways the organize button gets pressed:
//
//   FIRST RUN   given a cold corpus, is the proposal sane? Structural
//               invariants are hard failures (they'd break the review screen's
//               promises); theme placement is scored (a miss costs the manager
//               one dropdown selection, so it's reported, not gating).
//
//   RE-RUN      given the approved structure plus new documents, does the
//               proposal EXTEND rather than reshuffle? This is the load-bearing
//               behavior: a family that adds thirty documents later must not
//               watch its approved taxonomy churn. Preservation failures gate.
//
// Calls the real `proposeTrustTaxonomy` wrapper, so it exercises the shipped
// prompt, schema, and parser. Touches no database. Roughly $0.15 per full run
// at the Sonnet 5 default (3 first-run + 3 re-run calls, small corpus).
//
// Usage:
//   npx tsx --env-file=.env.local evals/trust-taxonomy/eval.mts

import {
  proposeTrustTaxonomy,
  type ExistingCategoryInput,
  type TaxonomyProposal,
} from "@/lib/trust/taxonomy";
import { ADDITION_CORPUS, BASE_CORPUS, type FixtureDoc } from "./corpus";

const RUNS = 3;

type RunReport = {
  hardFailures: string[];
  themeMisses: string[];
  notes: string[];
  categoryCount: number;
};

function checkStructure(
  proposal: TaxonomyProposal,
  corpus: FixtureDoc[],
): string[] {
  const failures: string[] = [];
  const ids = new Set(corpus.map((d) => d.id));
  const seen = new Set<string>();

  for (const c of proposal.categories) {
    if (!c.name.trim()) failures.push("empty category name");
    if (c.documentIds.length === 0) failures.push(`category "${c.name}" is empty`);
    for (const id of c.documentIds) {
      if (!ids.has(id)) failures.push(`invented document id ${id}`);
      if (seen.has(id)) failures.push(`document ${id} placed twice`);
      seen.add(id);
    }
  }
  for (const u of proposal.unassigned) {
    if (!ids.has(u.documentId)) failures.push(`invented unassigned id ${u.documentId}`);
    if (seen.has(u.documentId)) failures.push(`document ${u.documentId} placed twice`);
    seen.add(u.documentId);
  }
  if (seen.size !== corpus.length) {
    failures.push(`only ${seen.size}/${corpus.length} documents accounted for`);
  }
  if (proposal.categories.length < 2 || proposal.categories.length > 8) {
    failures.push(
      `${proposal.categories.length} categories for ${corpus.length} documents`,
    );
  }
  return failures;
}

function checkThemes(
  proposal: TaxonomyProposal,
  corpus: FixtureDoc[],
): { misses: string[]; notes: string[] } {
  const misses: string[] = [];
  const notes: string[] = [];
  const categoryOf = new Map<string, string>();
  for (const c of proposal.categories) {
    for (const id of c.documentIds) categoryOf.set(id, c.name);
  }
  for (const doc of corpus) {
    const placed = categoryOf.get(doc.id);
    if (doc.ambiguous) {
      notes.push(`${doc.name}: ${placed ? `→ "${placed}"` : "unassigned"} (ambiguous, not scored)`);
      continue;
    }
    if (!placed) {
      if (!doc.unassignedOk) misses.push(`${doc.name}: unassigned`);
      continue;
    }
    if (!doc.themes.some((t) => t.test(placed))) {
      misses.push(`${doc.name}: placed in "${placed}", expected ${doc.themes[0]}`);
    }
  }
  return { misses, notes };
}

function checkPreservation(
  proposal: TaxonomyProposal,
  existing: ExistingCategoryInput[],
): string[] {
  const failures: string[] = [];
  const returned = new Map(
    proposal.categories
      .filter((c) => c.existingCategoryId)
      .map((c) => [c.existingCategoryId!, c]),
  );

  for (const cat of existing) {
    const match = returned.get(cat.id);
    if (!match) {
      failures.push(`existing category "${cat.name}" dropped`);
      continue;
    }
    if (match.name.trim().toLowerCase() !== cat.name.trim().toLowerCase()) {
      failures.push(`existing category "${cat.name}" renamed to "${match.name}"`);
    }
  }

  // Previously placed documents should stay put (≤1 defensible move allowed).
  const newPlacement = new Map<string, string>();
  for (const c of proposal.categories) {
    for (const id of c.documentIds) {
      newPlacement.set(id, c.existingCategoryId ?? `new:${c.name}`);
    }
  }
  let moves = 0;
  for (const cat of existing) {
    for (const id of cat.documentIds) {
      if (newPlacement.get(id) !== cat.id) moves += 1;
    }
  }
  if (moves > 1) failures.push(`${moves} already-placed documents were moved`);
  return failures;
}

async function firstRun(): Promise<{ report: RunReport; proposal: TaxonomyProposal | null }> {
  const result = await proposeTrustTaxonomy({
    documents: BASE_CORPUS.map((d) => ({
      id: d.id,
      name: d.name,
      firstPageText: d.firstPageText,
    })),
    existingCategories: [],
  });
  if (!result.ok) {
    return {
      report: {
        hardFailures: [`call failed: ${result.message}`],
        themeMisses: [],
        notes: [],
        categoryCount: 0,
      },
      proposal: null,
    };
  }
  const { misses, notes } = checkThemes(result.proposal, BASE_CORPUS);
  return {
    report: {
      hardFailures: checkStructure(result.proposal, BASE_CORPUS),
      themeMisses: misses,
      notes,
      categoryCount: result.proposal.categories.length,
    },
    proposal: result.proposal,
  };
}

async function reRun(approved: TaxonomyProposal): Promise<RunReport> {
  // The "approved" structure is the first run's proposal, given stable fake
  // ids — exactly what applyTrustTaxonomy would have persisted.
  const existing: ExistingCategoryInput[] = approved.categories.map((c, i) => ({
    id: `cat-${i + 1}`,
    name: c.name,
    description: c.description,
    documentIds: c.documentIds,
  }));
  const corpus = [...BASE_CORPUS, ...ADDITION_CORPUS];
  const result = await proposeTrustTaxonomy({
    documents: corpus.map((d) => ({
      id: d.id,
      name: d.name,
      firstPageText: d.firstPageText,
    })),
    existingCategories: existing,
  });
  if (!result.ok) {
    return {
      hardFailures: [`call failed: ${result.message}`],
      themeMisses: [],
      notes: [],
      categoryCount: 0,
    };
  }
  const { misses, notes } = checkThemes(result.proposal, ADDITION_CORPUS);
  return {
    hardFailures: [
      ...checkStructure(result.proposal, corpus),
      ...checkPreservation(result.proposal, existing),
    ],
    themeMisses: misses,
    notes,
    categoryCount: result.proposal.categories.length,
  };
}

function printReport(label: string, r: RunReport) {
  console.log(`\n── ${label} ── ${r.categoryCount} categories`);
  for (const f of r.hardFailures) console.log(`  HARD FAIL  ${f}`);
  for (const m of r.themeMisses) console.log(`  miss       ${m}`);
  for (const n of r.notes) console.log(`  note       ${n}`);
  if (r.hardFailures.length === 0 && r.themeMisses.length === 0) {
    console.log("  clean");
  }
}

async function main() {
  let hardTotal = 0;
  let missTotal = 0;

  for (let i = 1; i <= RUNS; i++) {
    const { report, proposal } = await firstRun();
    printReport(`first run ${i}/${RUNS}`, report);
    hardTotal += report.hardFailures.length;
    missTotal += report.themeMisses.length;

    if (proposal && report.hardFailures.length === 0) {
      const rr = await reRun(proposal);
      printReport(`re-run ${i}/${RUNS}`, rr);
      hardTotal += rr.hardFailures.length;
      missTotal += rr.themeMisses.length;
    } else {
      console.log("  (re-run skipped: first run unusable)");
      hardTotal += 1;
    }
  }

  console.log(
    `\n══ TOTAL: ${hardTotal} hard failures, ${missTotal} theme misses over ${RUNS} paired runs ══`,
  );
  console.log(
    hardTotal === 0
      ? "GATE: PASS (no hard failures; judge theme misses by eye — each costs one dropdown fix in review)"
      : "GATE: FAIL (hard failures break the review screen's promises — fix before shipping)",
  );
  process.exitCode = hardTotal === 0 ? 0 : 1;
}

void main();
