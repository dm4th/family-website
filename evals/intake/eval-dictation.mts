// Smart Intake — dictation-intent eval (PRD 34).
//
// The photo evals asked "can it read the page?". This one asks a different
// question, because there is no reading involved: the phone already did the
// transcription, and the model's job is to tidy and sort. So the ways it can
// hurt somebody are different too.
//
//   preservation   did the tidy-up keep every fact they gave
//   tidiness       is it actually cleaner than what went in
//   routing        did rules land in guidelines and instructions in how-to
//   restraint      did a session naming nobody produce nobody, and a session
//                  naming no day produce no reminder
//   FABRICATED     did we invent a phone number, an email, or a date
//
// Two of those are new and specific to speech. **Preservation** matters here in
// a way it never did for a photo: the member's original is a stream of words
// they will not re-read, so anything the tidy-up silently drops is gone from
// their record of what they said. **Date resolution** matters because "the
// fifteenth" has to be turned into a real day, and a wrong month is invisible
// once it's sitting in a date box.
//
// Usage:
//   npx tsx --env-file=.env.local evals/intake/eval-dictation.mts

import { writeFileSync } from "node:fs";
import { extractFromDictation } from "@/lib/intake/extract";
import type { DictationExtraction, FieldConfidence } from "@/lib/intake/schema";
import { SAMPLES, type DateExpectation, type Sample } from "./dictation-samples";

const RUNS = 2;

/** Pinned once so every expectation in a run resolves against the same day. */
const TODAY = new Date();
const todayIso = TODAY.toISOString().slice(0, 10);

type Outcome =
  | "correct"
  | "missed"
  | "restraint"
  | "misrouted"
  | "fabricated";

type Row = {
  sample: string;
  run: number;
  check: string;
  outcome: Outcome;
  confidence: FieldConfidence;
  detail: string;
};

const rows: Row[] = [];
const perCall: { cost: number; secs: number; failed?: boolean }[] = [];

const digits = (s: string) => s.replace(/\D/g, "");
const normalise = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9@.]+/g, " ").trim();

function contains(haystack: string | null, needle: string): boolean {
  return Boolean(haystack) && normalise(haystack!).includes(normalise(needle));
}

/**
 * Resolve an expectation to the day the model should have landed on.
 *
 * "The fifteenth" means the next fifteenth on or after today — the reading a
 * person means when they say it, and the one the prompt asks for.
 */
function expectedDate(e: DateExpectation): string {
  const d = new Date(TODAY);
  switch (e.kind) {
    case "absolute": {
      // Stored as MM-DD; the speaker named no year, so accept this year or next.
      const thisYear = `${TODAY.getFullYear()}-${e.date}`;
      return thisYear >= todayIso
        ? thisYear
        : `${TODAY.getFullYear() + 1}-${e.date}`;
    }
    case "offsetDays":
      d.setDate(d.getDate() + e.days);
      return iso(d);
    case "nextDayOfMonth":
      if (d.getDate() >= e.day) d.setMonth(d.getMonth() + 1);
      d.setDate(e.day);
      return iso(d);
    case "firstOfNextMonth":
      d.setMonth(d.getMonth() + 1);
      d.setDate(1);
      return iso(d);
  }
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Is this proposed text drawn from what they actually said?
 *
 * Checked against the source transcript itself, which the photo evals could
 * never do — there, "what's on the page" had to be approximated by the model's
 * own transcription. Here the input is text we wrote, so a fabrication is
 * genuinely detectable rather than inferred.
 *
 * Compared on content words, because the tidy-up is *supposed* to change
 * wording: it punctuates, drops filler, and resolves false starts. Matching on
 * exact phrases would score correct behaviour as invention.
 */
function drawnFromSource(value: string, transcript: string): boolean {
  // A word normaliser of its own, without the "." that `normalise` keeps for
  // email addresses. With the period retained, a sentence-final "seat." never
  // matches the source's "seat", and correctly-routed text scored as invented —
  // which is exactly the kind of false alarm that teaches you to stop reading
  // the fabrication column.
  const words_ = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ");
  const source = new Set(words_(transcript));
  const words = words_(value).filter((w) => w.length > 3);
  if (words.length === 0) return true;
  const known = words.filter((w) => source.has(w)).length;
  // Most content words must appear in the source. A tidy-up adding connective
  // tissue is fine; one adding facts is not.
  return known / words.length >= 0.7;
}

/**
 * Filler proper — sounds that carry nothing. "I think" is deliberately absent:
 * in "it's about ninety dollars I think" the hedge is a fact about how sure the
 * speaker is, and stripping it would be rewriting rather than tidying.
 */
const FILLER = /\b(um+|uh+|erm+|hang on)\b/i;

function scoreOne(sample: Sample, run: number, x: DictationExtraction) {
  const push = (
    check: string,
    outcome: Outcome,
    confidence: FieldConfidence,
    detail: string,
  ) => rows.push({ sample: sample.id, run, check, outcome, confidence, detail });

  const text = x.transcription.value;

  // --- preservation: did every fact survive the tidy-up? -------------------
  for (const fact of sample.mustPreserve) {
    push(
      "preservation",
      contains(text, fact) ? "correct" : "missed",
      x.transcription.confidence,
      fact,
    );
  }

  // --- tidiness: is the output actually cleaner than the input? ------------
  if (text) {
    // Structure counts as tidiness, not just terminal punctuation: a short
    // dictation of two errands legitimately comes back as a bullet list with no
    // full stops in it, and that is more readable than the run-on that went in.
    const structured = /[.!?]/.test(text) || /^\s*(-|\*|#|\d+\.)\s/m.test(text);
    const stillFilled = FILLER.test(text);
    push(
      "tidiness",
      structured && !stillFilled ? "correct" : "missed",
      x.transcription.confidence,
      `${structured ? "structured" : "NEITHER punctuation nor list structure"}${stillFilled ? ", filler left in" : ""}`,
    );
  } else {
    push("tidiness", "missed", x.transcription.confidence, "empty transcription");
  }

  // --- routing -------------------------------------------------------------
  for (const [check, expected, field] of [
    ["guidelines", sample.guidelines, x.suggestedGuidelines],
    ["how_to", sample.howTo, x.suggestedHowTo],
  ] as const) {
    if (expected === null) {
      // Nothing belongs under this heading. Null is ideal; text that is really
      // in the transcript but filed here is a judgement call the member can
      // undo, and text that isn't in the transcript at all is invention.
      const outcome: Outcome =
        field.value === null
          ? "restraint"
          : drawnFromSource(field.value, sample.transcript)
            ? "misrouted"
            : "fabricated";
      push(check, outcome, field.confidence, (field.value ?? "").slice(0, 80));
    } else {
      const hit = expected.every((needle) => contains(field.value, needle));
      push(
        check,
        hit ? "correct" : "missed",
        field.confidence,
        (field.value ?? "").slice(0, 80),
      );
    }
  }

  // --- contacts: the phone-or-email rule -----------------------------------
  const wantedPhones = sample.contactPhones.map(digits);
  const gotPhones = x.suggestedContacts
    .map((c) => (c.phone ? digits(c.phone) : null))
    .filter((p): p is string => Boolean(p));

  for (const want of wantedPhones) {
    const hit = gotPhones.some((g) => g.endsWith(want) || want.endsWith(g));
    push(
      "contact_phone",
      hit ? "correct" : "missed",
      x.suggestedContacts[0]?.confidence ?? "low",
      want,
    );
  }
  for (const c of x.suggestedContacts) {
    if (!c.phone) continue;
    const g = digits(c.phone);
    const known = wantedPhones.some((w) => g.endsWith(w) || w.endsWith(g));
    if (!known) {
      push(
        "contact_phone",
        "fabricated",
        c.confidence,
        `${c.name ?? "?"} ${c.phone}`,
      );
    }
  }

  for (const want of sample.contactEmails) {
    const hit = x.suggestedContacts.some((c) => contains(c.email, want));
    push("contact_email", hit ? "correct" : "missed", "low", want);
  }
  for (const c of x.suggestedContacts) {
    if (!c.email) continue;
    if (!sample.contactEmails.some((w) => contains(c.email, w))) {
      push("contact_email", "fabricated", c.confidence, c.email);
    }
  }

  // A session naming nobody reachable must produce nobody. This is the check
  // that caught contact fabrication on the note intent.
  if (wantedPhones.length === 0 && sample.contactEmails.length === 0) {
    push(
      "contacts_empty",
      x.suggestedContacts.length === 0 ? "restraint" : "fabricated",
      "high",
      x.suggestedContacts.map((c) => `${c.name ?? "?"} ${c.phone ?? c.email ?? "(no way to reach)"}`).join(", "),
    );
  }

  // --- reminders: dates, the speech-specific hazard -------------------------
  const wantedDates = sample.dates.map(expectedDate);
  const gotDates = x.suggestedReminders.map((r) => r.dueDate);

  for (const want of wantedDates) {
    push(
      "reminder_date",
      gotDates.includes(want) ? "correct" : "missed",
      x.suggestedReminders.find((r) => r.dueDate === want)?.confidence ?? "low",
      want,
    );
  }
  for (const r of x.suggestedReminders) {
    if (!wantedDates.includes(r.dueDate)) {
      push(
        "reminder_date",
        "fabricated",
        r.confidence,
        `${r.title ?? "?"} → ${r.dueDate} (said: ${r.spokenAs ?? "nothing quoted"})`,
      );
    }
  }
  if (wantedDates.length === 0) {
    push(
      "reminders_empty",
      x.suggestedReminders.length === 0 ? "restraint" : "fabricated",
      "high",
      x.suggestedReminders.map((r) => `${r.title ?? "?"} ${r.dueDate}`).join(", "),
    );
  }

  // Every resolved date must quote the words it came from, or the member has no
  // way to check the arithmetic (see `spokenAs` in the schema).
  for (const r of x.suggestedReminders) {
    push(
      "spoken_as_quoted",
      r.spokenAs ? "correct" : "missed",
      r.confidence,
      `${r.dueDate} ← ${r.spokenAs ?? "(nothing)"}`,
    );
  }
}

// ------------------------------------------------------------------ run
const jobs: { sample: Sample; run: number }[] = [];
for (const sample of SAMPLES)
  for (let run = 1; run <= RUNS; run++) jobs.push({ sample, run });

console.error(`${jobs.length} dictation extractions queued (today = ${todayIso})`);

const RATE = { in: 1, out: 5 }; // claude-haiku-4-5, the shipped default

let done = 0;
for (const j of jobs) {
  const t0 = Date.now();
  const r = await extractFromDictation({ text: j.sample.transcript });
  const secs = (Date.now() - t0) / 1000;
  done++;
  if (!r.ok) {
    perCall.push({ cost: 0, secs, failed: true });
    console.error(`[${done}/${jobs.length}] FAILED ${j.sample.id}: ${r.message}`);
    continue;
  }
  perCall.push({
    cost:
      (r.usage.inputTokens / 1e6) * RATE.in +
      (r.usage.outputTokens / 1e6) * RATE.out,
    secs,
  });
  scoreOne(j.sample, j.run, r.extraction);
  console.error(`[${done}/${jobs.length}] ${j.sample.id} ${secs.toFixed(1)}s`);
}

writeFileSync("/tmp/dictation-records.json", JSON.stringify(rows, null, 1));

// --------------------------------------------------------------- report
const lines: string[] = [];
const pct = (n: number, d: number) =>
  d === 0 ? "  -  " : `${((100 * n) / d).toFixed(0)}%`.padStart(5);
const count = (rs: Row[], o: Outcome) => rs.filter((r) => r.outcome === o).length;

lines.push(`Run ${todayIso} · ${SAMPLES.length} transcripts × ${RUNS} runs\n`);

lines.push("## Outcomes by check\n");
lines.push("| check | n | correct | restraint | missed | misrouted | FABRICATED |");
lines.push("|---|---|---|---|---|---|---|");
for (const check of [
  "preservation",
  "tidiness",
  "guidelines",
  "how_to",
  "contact_phone",
  "contact_email",
  "contacts_empty",
  "reminder_date",
  "reminders_empty",
  "spoken_as_quoted",
]) {
  const rs = rows.filter((r) => r.check === check);
  if (!rs.length) continue;
  lines.push(
    `| ${check} | ${rs.length} | ${pct(count(rs, "correct"), rs.length)} | ${pct(count(rs, "restraint"), rs.length)} | ${pct(count(rs, "missed"), rs.length)} | ${pct(count(rs, "misrouted"), rs.length)} | **${pct(count(rs, "fabricated"), rs.length)}** (${count(rs, "fabricated")}) |`,
  );
}

lines.push("\n## Confidence calibration\n");
lines.push("| stated confidence | n | of those, FABRICATED |");
lines.push("|---|---|---|");
for (const conf of ["high", "medium", "low"] as const) {
  const rs = rows.filter((r) => r.confidence === conf);
  const bad = rs.filter((r) => r.outcome === "fabricated").length;
  lines.push(`| ${conf} | ${rs.length} | ${bad} (${pct(bad, rs.length)}) |`);
}

lines.push("\n## Cost and latency per dictation\n");
const okCalls = perCall.filter((c) => !c.failed);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
lines.push(
  `Mean $${mean(okCalls.map((c) => c.cost)).toFixed(4)} · ${mean(okCalls.map((c) => c.secs)).toFixed(1)}s · ${perCall.filter((c) => c.failed).length} failed calls`,
);

for (const [heading, outcome] of [
  ["Every fabrication, verbatim", "fabricated"],
  ["Every miss, verbatim", "missed"],
  ["Every misroute, verbatim", "misrouted"],
] as const) {
  lines.push(`\n## ${heading}\n`);
  const rs = rows.filter((r) => r.outcome === outcome);
  if (!rs.length) lines.push("- none");
  for (const r of rs)
    lines.push(
      `- \`${r.check}\` [${r.confidence}] on ${r.sample} (run ${r.run}): "${r.detail}"`,
    );
}

const report = lines.join("\n");
writeFileSync("/tmp/dictation-report.md", report);
console.log("\n" + report);
