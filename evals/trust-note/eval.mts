// Trust notebook eval (PRD 40 slice 3) — THE SHIP GATE for the notebook flow.
//
// The intake eval's handwriting evidence rested on a single 1860 document;
// this feature's whole input is handwriting, so it gets its own corpus and
// its own gates. Four questions, in order of the damage a failure does:
//
//   FABRICATED   did any key point rest on words that are NOT in the ground
//                truth? (Scored against ground truth, not the transcription,
//                so an OCR hallucination that feeds a point still counts.)
//                GATE: zero.
//   RESTRAINT    did the no-trust-content page yield zero key points, and
//                did points off the unrelated pages stay unmapped rather
//                than force-linking? GATE: zero violations.
//   ACCURACY     what fraction of ground-truth words made it into the
//                transcription, and how often was [unclear] used instead of
//                a guess? Reported; judge by eye.
//   RECALL       did the expected points surface, and did planted document
//                references map to the right fixture document? Reported.
//
// Calls the real readTrustScan / proposeScanMappings wrappers — the shipped
// prompts, schemas, and parsers. Touches no database.
//
// Usage (see README for the corpus protocol — the photos must exist first):
//   TRUST_NOTE_CORPUS=/path/to/photos npx tsx --env-file=.env.local evals/trust-note/eval.mts

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  proposeScanMappings,
  readTrustScan,
  selectMappingCandidates,
} from "@/lib/trust/notebook";
import { FIXTURE_DOC_PAGES, NOTE_PAGES } from "./corpus";

const CORPUS_DIR = process.env.TRUST_NOTE_CORPUS ?? "/tmp/trust-note-corpus";

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9.,%$]+/)
    .filter((w) => w.length >= 4);
}

/** Share of a candidate string's substantive words present in the reference. */
function groundedness(candidate: string, reference: string): number {
  const ref = new Set(words(reference));
  const cand = words(candidate);
  if (cand.length === 0) return 1;
  let hit = 0;
  for (const w of cand) if (ref.has(w)) hit += 1;
  return hit / cand.length;
}

function findImage(id: string): { path: string; contentType: string } | null {
  for (const [ext, type] of [
    ["jpg", "image/jpeg"],
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"],
  ] as const) {
    const path = join(CORPUS_DIR, `${id}.${ext}`);
    if (existsSync(path)) return { path, contentType: type };
  }
  return null;
}

async function main() {
  let fabricated = 0;
  let restraintViolations = 0;
  let forcedMappings = 0;
  let missingImages = 0;
  const recallLines: string[] = [];

  for (const page of NOTE_PAGES) {
    const image = findImage(page.id);
    if (!image) {
      console.log(`\n── ${page.id} ── MISSING (${CORPUS_DIR}/${page.id}.jpg not found)`);
      missingImages += 1;
      continue;
    }

    console.log(`\n── ${page.id} ── ${page.probe}`);
    const result = await readTrustScan({
      bytes: new Uint8Array(readFileSync(image.path)),
      contentType: image.contentType,
    });
    if (!result.ok) {
      console.log(`  HARD FAIL  read failed: ${result.message}`);
      fabricated += 1; // an unreadable page can't pass its gates
      continue;
    }
    const { read } = result;
    const transcription = read.pages.map((p) => p.transcription).join("\n");

    // ACCURACY (reported)
    const truthWords = words(page.groundTruth);
    const gotWords = new Set(words(transcription));
    const found = truthWords.filter((w) => gotWords.has(w)).length;
    const unclearCount = (transcription.match(/\[unclear\]/g) ?? []).length;
    console.log(
      `  accuracy   ${found}/${truthWords.length} ground-truth words in transcription · ${unclearCount} [unclear] marks · ${read.keyPoints.length} key points`,
    );

    // FABRICATION (gates)
    for (const k of read.keyPoints) {
      const basis = `${k.text} ${k.sourceQuote ?? ""}`;
      const score = groundedness(basis, page.groundTruth);
      if (score < 0.7) {
        fabricated += 1;
        console.log(
          `  FABRICATED "${k.text.slice(0, 80)}" (groundedness ${(score * 100).toFixed(0)}%)`,
        );
      }
    }

    // RESTRAINT (gates)
    if (page.noTrustContent && read.keyPoints.length > 0) {
      restraintViolations += 1;
      console.log(
        `  RESTRAINT  ${read.keyPoints.length} point(s) extracted from a page with no trust content`,
      );
    }

    // RECALL (reported)
    for (const expected of page.expectedPoints) {
      const hit = read.keyPoints.some((k) =>
        expected.mustMention.every((term) =>
          `${k.text} ${k.sourceQuote ?? ""}`.toLowerCase().includes(term.toLowerCase()),
        ),
      );
      recallLines.push(
        `${page.id}: [${expected.mustMention.join(", ")}] ${hit ? "surfaced" : "MISSED"}`,
      );
    }

    // MAPPING (planted references reported; forced mappings gate)
    if (read.keyPoints.length > 0) {
      const candidates = selectMappingCandidates(
        read.keyPoints.map((k) => ({ text: k.text, sourceQuote: k.sourceQuote })),
        FIXTURE_DOC_PAGES.map((p) => ({
          documentId: p.documentId,
          documentName: p.documentName,
          page: p.page,
          text: p.text,
        })),
      );
      const mapping = await proposeScanMappings({
        keyPoints: read.keyPoints.map((k) => ({ text: k.text, sourceQuote: k.sourceQuote })),
        candidates,
      });
      if (mapping.ok) {
        const mappedDocs = new Set(
          mapping.mappings.filter((m) => m.documentId).map((m) => m.documentId),
        );
        // Permitted = planted (should map; reported when missed) + allowed
        // (may defensibly map; neither required nor penalized). Only a
        // mapping OUTSIDE that set is forced — the PR #54 calibration, so a
        // model that correctly reads a named document off the page is not
        // failed for it.
        const permitted = new Set(
          [page.plantedReference, ...(page.allowedReferences ?? [])].filter(
            (d): d is string => !!d,
          ),
        );
        if (page.plantedReference) {
          console.log(
            `  mapping    planted ${page.plantedReference}: ${
              mappedDocs.has(page.plantedReference) ? "found" : "MISSED"
            }`,
          );
        }
        const outside = [...mappedDocs].filter(
          (d): d is string => !!d && !permitted.has(d),
        );
        if (outside.length > 0) {
          forcedMappings += 1;
          console.log(
            `  FORCED     mapped to ${outside.join(", ")} with no defensible reference on the page`,
          );
        }
      }
    }
  }

  console.log(`\n── recall ──`);
  for (const line of recallLines) console.log(`  ${line}`);

  console.log(
    `\n══ TOTAL: ${fabricated} fabricated, ${restraintViolations} restraint violations, ${forcedMappings} forced mappings, ${missingImages} missing images ══`,
  );
  const pass =
    fabricated === 0 &&
    restraintViolations === 0 &&
    forcedMappings === 0 &&
    missingImages === 0;
  console.log(
    pass
      ? "GATE: PASS (judge accuracy + recall lines by eye; a systematic miss means the prompt needs work)"
      : missingImages > 0
        ? "GATE: INCOMPLETE (photograph the missing pages per the README, then re-run)"
        : "GATE: FAIL (a fabricated point, extracted noise, or a forced mapping is exactly what the review screen must never be handed)",
  );
  process.exitCode = pass ? 0 : 1;
}

void main();
