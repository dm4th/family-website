// Smart Intake model eval (PRD 32).
//
// Question being settled: is Haiku 4.5 good enough to replace Sonnet 5 as the
// extraction model, given that a human reviews every field anyway?
//
// The metric that decides it is NOT overall accuracy. A field the model leaves
// null costs the reviewer a few seconds of typing. A field the model fills in
// with something plausible and WRONG is the one that can get saved, and it is
// worst when the model also says it is confident. So the eval separates:
//
//   correct        value matches the document
//   missed         null where the document has a value      (safe failure)
//   restraint      null where the document has NO value     (good behaviour)
//   FABRICATED     non-null and wrong                       (the dangerous one)
//
// and cross-tabs every outcome against the model's own confidence, so we can
// measure "how often does it say `high` and get it wrong".
//
// Half the corpus is real historic documents that carry no phone number and no
// email at all. On those, the only correct answer is null — they are pure
// fabrication tests.

import { readFileSync, writeFileSync } from "node:fs";
import { extractContactFromDocument } from "@/lib/intake/extract";
import type { ContactFieldKey, FieldConfidence } from "@/lib/intake/schema";

const MODELS = ["claude-sonnet-5", "claude-haiku-4-5"] as const;
const RATES: Record<string, { in: number; out: number }> = {
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};
const RUNS = 2;
const CONDITIONS = ["clean", "phone", "poor"] as const;

type Expect = {
  /** Value must match this once normalised. */
  match?: RegExp;
  /** The document contains no such value; anything non-null is fabricated. */
  mustBeNull?: boolean;
  /** Value must NOT contain this (e.g. the vendor's own address). */
  reject?: RegExp;
  /** Not scored — too fuzzy to grade fairly. */
  skip?: boolean;
};

type Sample = {
  id: string;
  kind: "synthetic" | "real";
  desc: string;
  truth: Partial<Record<ContactFieldKey, Expect>>;
};

const digits = (s: string) => s.replace(/\D/g, "");

const SAMPLES: Sample[] = [
  {
    id: "synth_electric",
    kind: "synthetic",
    desc: "US electric co-op bill",
    truth: {
      name: { match: /lakeside electric/i },
      phone: { match: /2075550184/ },
      email: { match: /service@lakesideelectric\.com/i },
      notes: { match: /884277103/ },
      // Service address, not the vendor's PO box in Augusta.
      address: { match: /418 loon lake/i, reject: /augusta|po box/i },
      label: { skip: true },
    },
  },
  {
    id: "synth_insurance",
    kind: "synthetic",
    desc: "US insurance premium notice",
    truth: {
      name: { match: /granite mutual/i },
      phone: { match: /18005552291/ },
      email: { match: /claims@granitemutual\.com/i },
      notes: { match: /3319845/ },
      address: { match: /22 birch hollow/i, reject: /concord|granite plaza/i },
      label: { skip: true },
    },
  },
  {
    id: "synth_water",
    kind: "synthetic",
    desc: "US municipal water bill (no email printed)",
    truth: {
      name: { match: /rangeley water|town of rangeley/i },
      phone: { match: /2075550110/ },
      email: { mustBeNull: true },
      notes: { match: /4471/ },
      address: { match: /418 loon lake/i, reject: /school street/i },
      label: { skip: true },
    },
  },
  {
    id: "1972_bolletta_ENEL",
    kind: "real",
    desc: "Real 1972 Italian electricity bill (no phone/email on document)",
    truth: {
      name: { match: /enel|ente nazionale/i },
      phone: { mustBeNull: true },
      email: { mustBeNull: true },
      address: { skip: true },
      notes: { skip: true },
      label: { skip: true },
    },
  },
  {
    id: "Chichester_local_rates_bill_1929",
    kind: "real",
    desc: "Real 1929 UK property rates demand (no phone/email on document)",
    truth: {
      name: { match: /chichester/i },
      phone: { mustBeNull: true },
      email: { mustBeNull: true },
      address: { skip: true },
      notes: { skip: true },
      label: { skip: true },
    },
  },
  {
    id: "1860_Gay_Head_Light_repair_bill",
    kind: "real",
    desc: "Real 1860 handwritten US repair bill (no phone/email on document)",
    truth: {
      name: { match: /belain|light.?house/i },
      phone: { mustBeNull: true },
      email: { mustBeNull: true },
      address: { skip: true },
      notes: { skip: true },
      label: { skip: true },
    },
  },
];

type Outcome = "correct" | "missed" | "restraint" | "fabricated";
type Record_ = {
  model: string;
  sample: string;
  kind: string;
  condition: string;
  run: number;
  field: string;
  outcome: Outcome;
  confidence: FieldConfidence;
  value: string | null;
};

function score(value: string | null, e: Expect): Outcome | null {
  if (e.skip) return null;
  const norm = (value ?? "").toLowerCase();
  if (e.mustBeNull) return value === null ? "restraint" : "fabricated";
  if (value === null) return "missed";
  if (e.reject && e.reject.test(norm)) return "fabricated";
  if (e.match) {
    const ok = e.match.test(norm) || e.match.test(digits(value));
    return ok ? "correct" : "fabricated";
  }
  return "correct";
}

const records: Record_[] = [];
const perCall: { model: string; cost: number; secs: number; failed?: boolean }[] = [];

const jobs: { model: string; sample: Sample; condition: string; run: number }[] = [];
for (const model of MODELS)
  for (const sample of SAMPLES)
    for (const condition of CONDITIONS)
      for (let run = 1; run <= RUNS; run++) jobs.push({ model, sample, condition, run });

console.error(`${jobs.length} extractions queued`);

let done = 0;
for (const j of jobs) {
  const file = `/tmp/evalset/out/${j.sample.id}__${j.condition}.jpg`;
  const bytes = new Uint8Array(readFileSync(file));
  process.env.INTAKE_MODEL = j.model;
  const t0 = Date.now();
  const r = await extractContactFromDocument({ bytes, contentType: "image/jpeg" });
  const secs = (Date.now() - t0) / 1000;
  done++;
  if (!r.ok) {
    perCall.push({ model: j.model, cost: 0, secs, failed: true });
    console.error(`[${done}/${jobs.length}] FAILED ${j.model} ${j.sample.id} ${j.condition}`);
    continue;
  }
  const rate = RATES[j.model];
  const cost = (r.usage.inputTokens / 1e6) * rate.in + (r.usage.outputTokens / 1e6) * rate.out;
  perCall.push({ model: j.model, cost, secs });

  for (const [field, expect] of Object.entries(j.sample.truth)) {
    const f = r.extraction.fields[field as ContactFieldKey];
    const outcome = score(f.value, expect as Expect);
    if (!outcome) continue;
    records.push({
      model: j.model,
      sample: j.sample.id,
      kind: j.sample.kind,
      condition: j.condition,
      run: j.run,
      field,
      outcome,
      confidence: f.confidence,
      value: f.value,
    });
  }
  console.error(`[${done}/${jobs.length}] ${j.model} ${j.sample.id} ${j.condition} ${secs.toFixed(1)}s`);
}

writeFileSync("/tmp/evalset/records.json", JSON.stringify({ records, perCall }, null, 1));

// ---------------------------------------------------------------- report
const lines: string[] = [];
const pct = (n: number, d: number) => (d === 0 ? "  -  " : `${((100 * n) / d).toFixed(0)}%`.padStart(5));

lines.push("## Outcomes by model (all scored fields)\n");
lines.push("| model | fields | correct | restraint | missed (safe) | FABRICATED |");
lines.push("|---|---|---|---|---|---|");
for (const m of MODELS) {
  const rs = records.filter((r) => r.model === m);
  const c = (o: Outcome) => rs.filter((r) => r.outcome === o).length;
  lines.push(
    `| ${m} | ${rs.length} | ${pct(c("correct"), rs.length)} | ${pct(c("restraint"), rs.length)} | ${pct(c("missed"), rs.length)} | **${pct(c("fabricated"), rs.length)}** (${c("fabricated")}) |`,
  );
}

lines.push("\n## Fabrication by document difficulty\n");
lines.push("| model | condition | fabricated / scored |");
lines.push("|---|---|---|");
for (const m of MODELS)
  for (const cond of CONDITIONS) {
    const rs = records.filter((r) => r.model === m && r.condition === cond);
    const fab = rs.filter((r) => r.outcome === "fabricated").length;
    lines.push(`| ${m} | ${cond} | ${fab}/${rs.length} (${pct(fab, rs.length)}) |`);
  }

lines.push("\n## Confidence calibration — does `high` mean anything?\n");
lines.push("| model | stated confidence | n | of those, WRONG |");
lines.push("|---|---|---|---|");
for (const m of MODELS)
  for (const conf of ["high", "medium", "low"] as const) {
    const rs = records.filter((r) => r.model === m && r.confidence === conf);
    const bad = rs.filter((r) => r.outcome === "fabricated").length;
    lines.push(`| ${m} | ${conf} | ${rs.length} | ${bad} (${pct(bad, rs.length)}) |`);
  }

lines.push("\n## The fabrication test: documents with NO phone/email at all\n");
lines.push("| model | invented a phone or email | out of |");
lines.push("|---|---|---|");
for (const m of MODELS) {
  const rs = records.filter(
    (r) => r.model === m && r.kind === "real" && (r.field === "phone" || r.field === "email"),
  );
  const fab = rs.filter((r) => r.outcome === "fabricated");
  lines.push(`| ${m} | **${fab.length}** | ${rs.length} |`);
}

lines.push("\n## Cost and latency per document\n");
lines.push("| model | mean cost | mean latency | failed calls |");
lines.push("|---|---|---|---|");
for (const m of MODELS) {
  const cs = perCall.filter((c) => c.model === m && !c.failed);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  lines.push(
    `| ${m} | $${mean(cs.map((c) => c.cost)).toFixed(4)} | ${mean(cs.map((c) => c.secs)).toFixed(1)}s | ${perCall.filter((c) => c.model === m && c.failed).length} |`,
  );
}

lines.push("\n## Every fabrication, verbatim\n");
for (const m of MODELS) {
  lines.push(`\n**${m}**`);
  const fab = records.filter((r) => r.model === m && r.outcome === "fabricated");
  if (!fab.length) lines.push("- none");
  for (const r of fab)
    lines.push(`- \`${r.field}\` [${r.confidence}] on ${r.sample} (${r.condition}): "${r.value}"`);
}

const report = lines.join("\n");
writeFileSync("/tmp/evalset/report.md", report);
console.log("\n" + report);
