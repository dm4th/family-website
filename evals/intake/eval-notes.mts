// Smart Intake — note-intent eval (PRD 32, slice 2).
//
// Slice 1's eval asked which model to use. This one asks a different question,
// because the model is already settled: **is the note intent safe to ship?**
//
// Handwriting is the least reliable input this feature accepts, and the note
// schema proposes more than the contact schema did — a transcription, two blocks
// of property prose, and any number of contacts. So the things worth measuring
// are the ways that can go wrong for a member who trusts it:
//
//   transcription   did we read the note at all
//   routing         did rules land in guidelines and instructions in how-to
//   restraint       did a note with nobody in it produce nobody
//   FABRICATED      did we invent a phone number that isn't on the page
//
// The last one is the one that matters. A wrong transcription is visible next to
// the photo; a plausible wrong phone number saved as a contact is not.
//
// Usage:
//   python3 evals/intake/make-notes.py
//   for b in note_*; do for c in clean phone poor; do python3 evals/intake/degrade.py ...; done; done
//   npx tsx --env-file=.env.local evals/intake/eval-notes.mts

import { readFileSync, writeFileSync } from "node:fs";
import { extractFromDocument } from "@/lib/intake/extract";
import type { FieldConfidence, NoteExtraction } from "@/lib/intake/schema";

const CONDITIONS = ["clean", "phone", "poor"] as const;
const RUNS = 2;

/** Written by make-notes.py alongside the images, so the two can't drift. */
type Truth = {
  transcription_must_contain: string[];
  guidelines_must_contain: string[] | null;
  howto_must_contain: string[] | null;
  contact_phones: string[];
};

const SYNTHETIC: Record<string, Truth> = JSON.parse(
  readFileSync("/tmp/evalset/clean/note-truth.json", "utf8"),
);

/**
 * A real handwritten document, read as a note. It carries no phone number and
 * no email at all, so every contact suggestion it produces is invented — the
 * only honest answer is an empty list. This is the sample the synthetic notes
 * can't be: genuine 19th-century handwriting, not a script font.
 */
const REAL: Record<string, Truth> = {
  "1860_Gay_Head_Light_repair_bill": {
    transcription_must_contain: [],
    guidelines_must_contain: null,
    howto_must_contain: null,
    contact_phones: [],
  },
};

const ALL = { ...SYNTHETIC, ...REAL };

const digits = (s: string) => s.replace(/\D/g, "");

/**
 * `misrouted` is deliberately its own bucket rather than being folded into
 * `fabricated`. Putting "leave the heat on 50, not off" under guidelines when we
 * expected how-to is a judgement call about a line that really is on the page —
 * the member sees the text in an editable box and can move it. Returning a
 * phone number that is not on the page is a different kind of event entirely.
 * Scoring them the same would have hidden a clean fabrication record behind a
 * scary-looking headline number.
 */
type Outcome =
  | "correct"
  | "missed"
  | "restraint"
  | "misrouted"
  | "fabricated";
type Row = {
  sample: string;
  condition: string;
  run: number;
  check: string;
  outcome: Outcome;
  confidence: FieldConfidence;
  detail: string;
};

const rows: Row[] = [];
const perCall: { cost: number; secs: number; failed?: boolean }[] = [];

function containsAll(haystack: string | null, needles: string[]): boolean {
  if (!haystack) return false;
  const h = haystack.toLowerCase();
  return needles.every((n) => h.includes(n.toLowerCase()));
}

const normalise = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Is this proposed text actually drawn from the note, or made up? Checked
 * against the model's own transcription rather than the source text, because
 * the transcription is what we independently verify elsewhere and it's the
 * fairest available stand-in for "what's on the page". Compares the first few
 * words so trailing edits and line joins don't read as invention.
 */
function onThePage(value: string, transcription: string | null): boolean {
  if (!transcription) return false;
  const hay = normalise(transcription);
  return value
    // Split the raw text into lines/sentences first — normalising strips the
    // punctuation these boundaries rely on.
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => normalise(line).split(" ").slice(0, 5).join(" "))
    .filter((chunk) => chunk.length > 8)
    .some((chunk) => hay.includes(chunk));
}

function scoreOne(
  sample: string,
  condition: string,
  run: number,
  truth: Truth,
  x: NoteExtraction,
) {
  const push = (
    check: string,
    outcome: Outcome,
    confidence: FieldConfidence,
    detail: string,
  ) => rows.push({ sample, condition, run, check, outcome, confidence, detail });

  // --- transcription -------------------------------------------------------
  if (truth.transcription_must_contain.length) {
    push(
      "transcription",
      containsAll(x.transcription.value, truth.transcription_must_contain)
        ? "correct"
        : "missed",
      x.transcription.confidence,
      (x.transcription.value ?? "").slice(0, 80),
    );
  }

  // --- routing: does the right kind of line land in the right field? -------
  for (const [check, expected, field] of [
    ["guidelines", truth.guidelines_must_contain, x.suggestedGuidelines],
    ["how_to", truth.howto_must_contain, x.suggestedHowTo],
  ] as const) {
    if (expected === null) {
      // The note has nothing we'd file under this heading. Null is the ideal
      // answer. A non-null value is only a fabrication if the text isn't on the
      // page at all; if it is on the page, the model has filed a real line under
      // a heading we'd have chosen differently, which is a much smaller thing.
      const outcome: Outcome =
        field.value === null
          ? "restraint"
          : onThePage(field.value, x.transcription.value)
            ? "misrouted"
            : "fabricated";
      push(check, outcome, field.confidence, (field.value ?? "").slice(0, 80));
    } else {
      push(
        check,
        containsAll(field.value, expected) ? "correct" : "missed",
        field.confidence,
        (field.value ?? "").slice(0, 80),
      );
    }
  }

  // --- contacts: the dangerous one -----------------------------------------
  const gotPhones = x.suggestedContacts
    .map((c) => (c.phone ? digits(c.phone) : null))
    .filter((p): p is string => Boolean(p));
  const wanted = new Set(truth.contact_phones);

  for (const want of truth.contact_phones) {
    const hit = gotPhones.some((g) => g.endsWith(want) || want.endsWith(g));
    const contact = x.suggestedContacts.find(
      (c) => c.phone && digits(c.phone).endsWith(want.slice(-7)),
    );
    push(
      "contact_phone",
      hit ? "correct" : "missed",
      contact?.confidence ?? "low",
      want,
    );
  }

  for (const c of x.suggestedContacts) {
    if (!c.phone) continue;
    const g = digits(c.phone);
    const matches = [...wanted].some((w) => g.endsWith(w) || w.endsWith(g));
    if (!matches) {
      push("contact_phone", "fabricated", c.confidence, `${c.name ?? "?"} ${c.phone}`);
    }
  }

  // A note naming nobody should produce nobody. Suggesting a contact with no
  // number at all off such a note is still noise worth counting.
  if (truth.contact_phones.length === 0) {
    push(
      "contacts_empty",
      x.suggestedContacts.length === 0 ? "restraint" : "fabricated",
      "high",
      x.suggestedContacts.map((c) => c.name ?? "?").join(", "),
    );
  }
}

// ------------------------------------------------------------------ run
const jobs: { sample: string; condition: string; run: number }[] = [];
for (const sample of Object.keys(ALL))
  for (const condition of CONDITIONS)
    for (let run = 1; run <= RUNS; run++) jobs.push({ sample, condition, run });

console.error(`${jobs.length} note extractions queued`);

const RATE = { in: 1, out: 5 }; // claude-haiku-4-5, the shipped default

let done = 0;
for (const j of jobs) {
  const file = `/tmp/evalset/out/${j.sample}__${j.condition}.jpg`;
  const bytes = new Uint8Array(readFileSync(file));
  const t0 = Date.now();
  const r = await extractFromDocument({
    bytes,
    contentType: "image/jpeg",
    intent: "note",
  });
  const secs = (Date.now() - t0) / 1000;
  done++;
  if (!r.ok) {
    perCall.push({ cost: 0, secs, failed: true });
    console.error(`[${done}/${jobs.length}] FAILED ${j.sample} ${j.condition}`);
    continue;
  }
  perCall.push({
    cost:
      (r.usage.inputTokens / 1e6) * RATE.in +
      (r.usage.outputTokens / 1e6) * RATE.out,
    secs,
  });
  scoreOne(j.sample, j.condition, j.run, ALL[j.sample], r.extraction);
  console.error(
    `[${done}/${jobs.length}] ${j.sample} ${j.condition} ${secs.toFixed(1)}s`,
  );
}

writeFileSync("/tmp/evalset/note-records.json", JSON.stringify(rows, null, 1));

// --------------------------------------------------------------- report
const lines: string[] = [];
const pct = (n: number, d: number) =>
  d === 0 ? "  -  " : `${((100 * n) / d).toFixed(0)}%`.padStart(5);
const count = (rs: Row[], o: Outcome) => rs.filter((r) => r.outcome === o).length;

lines.push("## Outcomes by check\n");
lines.push(
  "| check | n | correct | restraint | missed | misrouted | FABRICATED |",
);
lines.push("|---|---|---|---|---|---|---|");
for (const check of [
  "transcription",
  "guidelines",
  "how_to",
  "contact_phone",
  "contacts_empty",
]) {
  const rs = rows.filter((r) => r.check === check);
  if (!rs.length) continue;
  lines.push(
    `| ${check} | ${rs.length} | ${pct(count(rs, "correct"), rs.length)} | ${pct(count(rs, "restraint"), rs.length)} | ${pct(count(rs, "missed"), rs.length)} | ${pct(count(rs, "misrouted"), rs.length)} | **${pct(count(rs, "fabricated"), rs.length)}** (${count(rs, "fabricated")}) |`,
  );
}

lines.push("\n## By photo quality\n");
lines.push(
  "| condition | n | correct | restraint | missed | misrouted | FABRICATED |",
);
lines.push("|---|---|---|---|---|---|---|");
for (const c of CONDITIONS) {
  const rs = rows.filter((r) => r.condition === c);
  lines.push(
    `| ${c} | ${rs.length} | ${pct(count(rs, "correct"), rs.length)} | ${pct(count(rs, "restraint"), rs.length)} | ${pct(count(rs, "missed"), rs.length)} | ${pct(count(rs, "misrouted"), rs.length)} | **${pct(count(rs, "fabricated"), rs.length)}** (${count(rs, "fabricated")}) |`,
  );
}

lines.push("\n## Confidence calibration — does `high` mean anything?\n");
lines.push("| stated confidence | n | of those, WRONG |");
lines.push("|---|---|---|");
for (const conf of ["high", "medium", "low"] as const) {
  const rs = rows.filter((r) => r.confidence === conf);
  const bad = rs.filter((r) => r.outcome === "fabricated").length;
  lines.push(`| ${conf} | ${rs.length} | ${bad} (${pct(bad, rs.length)}) |`);
}

lines.push("\n## Cost and latency per note\n");
const okCalls = perCall.filter((c) => !c.failed);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
lines.push(
  `Mean $${mean(okCalls.map((c) => c.cost)).toFixed(4)} · ${mean(okCalls.map((c) => c.secs)).toFixed(1)}s · ${perCall.filter((c) => c.failed).length} failed calls`,
);

lines.push("\n## Every fabrication, verbatim\n");
const fab = rows.filter((r) => r.outcome === "fabricated");
if (!fab.length) lines.push("- none");
for (const r of fab)
  lines.push(
    `- \`${r.check}\` [${r.confidence}] on ${r.sample} (${r.condition}): "${r.detail}"`,
  );

lines.push("\n## Every misroute, verbatim\n");
const misrouted = rows.filter((r) => r.outcome === "misrouted");
if (!misrouted.length) lines.push("- none");
for (const r of misrouted)
  lines.push(
    `- \`${r.check}\` [${r.confidence}] on ${r.sample} (${r.condition}): "${r.detail}"`,
  );

lines.push("\n## Every miss, verbatim\n");
const missed = rows.filter((r) => r.outcome === "missed");
if (!missed.length) lines.push("- none");
for (const r of missed)
  lines.push(
    `- \`${r.check}\` [${r.confidence}] on ${r.sample} (${r.condition}): got "${r.detail}"`,
  );

const report = lines.join("\n");
writeFileSync("/tmp/evalset/note-report.md", report);
console.log("\n" + report);
