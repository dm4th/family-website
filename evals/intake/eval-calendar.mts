// Smart Intake — calendar-intent eval (PRD 32, slice 3).
//
// The question this one answers: **is it safe to let this feature put dates on
// the family's calendar?**
//
// A due date is unlike the fields the earlier evals scored. A misread vendor
// name looks wrong on the page. A misread phone number fails when dialled. A
// date that is off by five days looks completely normal in every direction and
// is only discovered when something is late. So the buckets here are built
// around the ways a date goes wrong, and one of them matters far more than the
// rest:
//
//   correct      every date on the document was found, and nothing else was
//   restraint    a document with no deadline produced no reminder
//   missed       a real due date was not found (costs typing, not trust)
//   FABRICATED   a date was returned that is not on the document
//
// Plus two that are specific to this intent:
//
//   recurrence_overreach   proposed a repeat the document never claims. This is
//                          the quiet one: a wrong repeat doesn't put one wrong
//                          entry on the calendar, it puts one there every month
//                          forever, and each is individually plausible.
//   amount_wrong           a figure that isn't printed on the page
//
// Usage:
//   python3 evals/intake/make-bills-dated.py        (in a scratch directory)
//   for b in cal_*.jpg; do python3 evals/intake/degrade.py "$b" "out/${b%.jpg}__photo.jpg" photo 7; done
//   npx tsx --env-file=.env.local evals/intake/eval-calendar.mts <dir>

import { readFileSync, writeFileSync } from "node:fs";
import { extractFromDocument } from "@/lib/intake/extract";
import type { CalendarExtraction, FieldConfidence } from "@/lib/intake/schema";

const DIR = process.argv[2] ?? ".";
const CONDITIONS = ["clean", "photo", "poor"] as const;
const RUNS = 2;

/** Written by make-bills-dated.py alongside the images, so they can't drift. */
type Truth = { dates: string[]; amounts: string[]; recurrence: string[] };
const TRUTH: Record<string, Truth> = JSON.parse(
  readFileSync(`${DIR}/cal-truth.json`, "utf8"),
);

type Outcome =
  | "correct"
  | "restraint"
  | "missed"
  | "fabricated"
  | "recurrence_overreach"
  | "recurrence_missed"
  | "amount_wrong";

type Row = {
  sample: string;
  condition: string;
  run: number;
  check: string;
  outcome: Outcome;
  detail: string;
  confidence: FieldConfidence;
};

const rows: Row[] = [];
const perCall: { cost: number; secs: number; failed?: boolean }[] = [];

/** Money compared on digits alone, so "$1,847.00" and "1847.00" agree. */
const money = (s: string) => s.replace(/[^\d.]/g, "").replace(/\.00$/, "");

function score(
  sample: string,
  condition: string,
  run: number,
  x: CalendarExtraction,
) {
  const truth = TRUTH[sample];
  const got = x.reminders;
  const worstConfidence: FieldConfidence =
    got.find((r) => r.confidence === "low")?.confidence ??
    got.find((r) => r.confidence === "medium")?.confidence ??
    "high";

  const push = (check: string, outcome: Outcome, detail: string) =>
    rows.push({
      sample,
      condition,
      run,
      check,
      outcome,
      detail,
      confidence: worstConfidence,
    });

  // --- restraint: a document with no deadline must produce nothing ---------
  if (truth.dates.length === 0) {
    if (got.length === 0) {
      push("dates", "restraint", "no deadline on the page, none offered");
    } else {
      for (const r of got) {
        push(
          "dates",
          "fabricated",
          `offered ${r.dueDate} ("${r.title}") off a document with no due date`,
        );
      }
    }
    return;
  }

  // --- every truth date found? -------------------------------------------
  const gotDates = got.map((r) => r.dueDate);
  for (const want of truth.dates) {
    if (gotDates.includes(want)) push("dates", "correct", want);
    else push("dates", "missed", `did not find ${want}`);
  }

  // --- anything returned that isn't on the page? -------------------------
  for (const r of got) {
    if (!truth.dates.includes(r.dueDate)) {
      push(
        "dates",
        "fabricated",
        `returned ${r.dueDate} ("${r.title}"), not a due date on the page`,
      );
    }
  }

  // --- recurrence: only what the document itself states -------------------
  // Matched positionally against the truth date, so a bill that states
  // "annually" is scored against the reminder carrying that bill's date.
  for (const r of got) {
    const i = truth.dates.indexOf(r.dueDate);
    if (i === -1) continue; // already counted as fabricated
    const want = truth.recurrence[i] ?? "none";
    if (r.recurrence === want) continue;
    if (want === "none") {
      push(
        "recurrence",
        "recurrence_overreach",
        `claimed "${r.recurrence}" on a document that never says it repeats`,
      );
    } else {
      push(
        "recurrence",
        "recurrence_missed",
        `answered "${r.recurrence}", document states "${want}"`,
      );
    }
  }

  // --- amounts: a figure not printed on the page is fabrication -----------
  const truthMoney = truth.amounts.map(money);
  for (const r of got) {
    if (!r.amount) continue;
    if (!truthMoney.includes(money(r.amount))) {
      push(
        "amount",
        "amount_wrong",
        `returned ${r.amount}, page shows ${truth.amounts.join(" / ") || "no amount"}`,
      );
    }
  }
}

// ------------------------------------------------------------------ run
const jobs: { sample: string; condition: string; run: number }[] = [];
for (const sample of Object.keys(TRUTH))
  for (const condition of CONDITIONS)
    for (let run = 1; run <= RUNS; run++) jobs.push({ sample, condition, run });

console.error(`${jobs.length} calendar extractions queued`);

const RATE = { in: 1, out: 5 }; // claude-haiku-4-5, the shipped default

let done = 0;
for (const j of jobs) {
  const file =
    j.condition === "clean"
      ? `${DIR}/${j.sample}.jpg`
      : `${DIR}/out/${j.sample}__${j.condition}.jpg`;
  const bytes = new Uint8Array(readFileSync(file));
  const t0 = Date.now();
  const r = await extractFromDocument({
    bytes,
    contentType: "image/jpeg",
    intent: "calendar",
  });
  const secs = (Date.now() - t0) / 1000;
  done++;
  if (!r.ok) {
    perCall.push({ cost: 0, secs, failed: true });
    console.error(
      `[${done}/${jobs.length}] FAILED ${j.sample} ${j.condition}: ${r.message}`,
    );
    continue;
  }
  perCall.push({
    cost:
      (r.usage.inputTokens / 1e6) * RATE.in +
      (r.usage.outputTokens / 1e6) * RATE.out,
    secs,
  });
  score(j.sample, j.condition, j.run, r.extraction);
  console.error(
    `[${done}/${jobs.length}] ${j.sample} ${j.condition} run${j.run}: ${r.extraction.reminders.length} reminder(s)`,
  );
}

// ------------------------------------------------------------------ report
const count = (o: Outcome) => rows.filter((r) => r.outcome === o).length;
const dateRows = rows.filter((r) => r.check === "dates");

const out: string[] = [];
const say = (s = "") => {
  out.push(s);
  console.log(s);
};

say("\n=== Calendar intent (claude-haiku-4-5) ===\n");
say(`extractions: ${perCall.length}  failed: ${perCall.filter((p) => p.failed).length}`);
say(
  `cost: $${perCall.reduce((a, b) => a + b.cost, 0).toFixed(4)} total, ~$${(
    perCall.reduce((a, b) => a + b.cost, 0) / Math.max(1, perCall.length)
  ).toFixed(4)}/doc`,
);
say(
  `latency: median ${
    [...perCall.map((p) => p.secs)].sort((a, b) => a - b)[
      Math.floor(perCall.length / 2)
    ]?.toFixed(1) ?? "-"
  }s\n`,
);

say("dates");
for (const o of ["correct", "restraint", "missed", "fabricated"] as const) {
  const n = rows.filter((r) => r.check === "dates" && r.outcome === o).length;
  const pct = dateRows.length ? ((n / dateRows.length) * 100).toFixed(0) : "0";
  say(`  ${o.padEnd(12)} ${String(n).padStart(3)}  ${pct}%`);
}

say("\nrecurrence");
say(`  overreach    ${String(count("recurrence_overreach")).padStart(3)}`);
say(`  missed       ${String(count("recurrence_missed")).padStart(3)}`);

say("\namounts");
say(`  wrong        ${String(count("amount_wrong")).padStart(3)}`);

say("\nby condition");
for (const c of CONDITIONS) {
  const sub = rows.filter((r) => r.condition === c && r.check === "dates");
  const ok = sub.filter(
    (r) => r.outcome === "correct" || r.outcome === "restraint",
  ).length;
  const fab = sub.filter((r) => r.outcome === "fabricated").length;
  say(
    `  ${c.padEnd(7)} ${ok}/${sub.length} right, ${fab} fabricated`,
  );
}

say("\nconfidence vs outcome (does the model know when it's wrong?)");
for (const conf of ["high", "medium", "low"] as const) {
  const sub = dateRows.filter((r) => r.confidence === conf);
  if (!sub.length) continue;
  const bad = sub.filter(
    (r) => r.outcome === "fabricated" || r.outcome === "missed",
  ).length;
  say(`  ${conf.padEnd(7)} ${sub.length} rows, ${bad} wrong`);
}

const fab = rows.filter((r) => r.outcome === "fabricated");
if (fab.length) {
  say("\nFABRICATIONS");
  for (const r of fab) say(`  ${r.sample} ${r.condition} run${r.run}: ${r.detail}`);
}
const over = rows.filter((r) => r.outcome === "recurrence_overreach");
if (over.length) {
  say("\nRECURRENCE OVERREACH");
  for (const r of over) say(`  ${r.sample} ${r.condition} run${r.run}: ${r.detail}`);
}
const missed = rows.filter((r) => r.outcome === "missed");
if (missed.length) {
  say("\nMISSED");
  for (const r of missed) say(`  ${r.sample} ${r.condition} run${r.run}: ${r.detail}`);
}
const amt = rows.filter((r) => r.outcome === "amount_wrong");
if (amt.length) {
  say("\nAMOUNTS");
  for (const r of amt) say(`  ${r.sample} ${r.condition} run${r.run}: ${r.detail}`);
}

writeFileSync(`${DIR}/calendar-eval-rows.json`, JSON.stringify(rows, null, 2));
say(`\nrows written to ${DIR}/calendar-eval-rows.json`);
