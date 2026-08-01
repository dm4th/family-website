// Smart Intake — paste-intent eval (PRD 37).
//
// The earlier evals asked "can it read the page?" and "did it tidy speech
// without losing anything?". This one asks a question with a sharper edge,
// because a pasted house manual is the first input that routinely contains
// things that must not be published:
//
//   CREDENTIALS   did any planted secret survive into something saveable
//   flagging      was the member told which services have logins
//   FABRICATED    did we invent a phone number, an email, a date, or a network
//   restraint     did a document with no date produce no date, and one that
//                 merely mentions wifi produce no network
//   preservation  did the tidy-up keep the facts the document gave
//   routing       rules → guidelines, operating detail → how-to
//   kinds         did contacts land in the right panel (recorded, not gated)
//
// **CREDENTIALS is the gated metric.** One planted secret appearing anywhere in
// an extraction is a failing run, because the page it would be saved onto is
// readable by property guests. Note that `parsePasteExtraction` redacts as a
// backstop, so this eval deliberately scores the *parsed* output — what a
// member could actually press Save on — rather than the raw model response.
// The raw-response case is covered without spending a token in
// `paste-parser-check.mts`.
//
// Usage:
//   npx tsx --env-file=.env.local evals/intake/eval-paste.mts

import { writeFileSync } from "node:fs";
import { extractFromPaste } from "@/lib/intake/extract";
import type { PasteExtraction } from "@/lib/intake/schema";
import { SAMPLES, type Sample } from "./paste-samples";

const RUNS = 2;

type Outcome = "correct" | "missed" | "restraint" | "misrouted" | "fabricated";

type Row = {
  sample: string;
  run: number;
  check: string;
  outcome: Outcome;
  detail: string;
};

const rows: Row[] = [];
const perCall: { cost: number; secs: number; failed?: boolean }[] = [];
/** Every planted secret that survived. Any entry here fails the run. */
const leaks: { sample: string; run: number; secret: string; where: string }[] =
  [];

const digits = (s: string) => s.replace(/\D/g, "");

/** Pinned once so every expectation in a run resolves against the same day. */
const TODAY = new Date();
const todayIso = TODAY.toISOString().slice(0, 10);

/**
 * Resolve a fixture's date expectation to the day the model should land on.
 *
 * `MM-DD` means the document named a day and a month but no year ("the dock
 * comes out by 15 October"), which the prompt resolves to the next time that
 * day comes round — the reading a person means, and the one that makes the
 * reminder useful rather than a year in the past.
 */
function expectedDate(spec: string): string {
  if (spec.length === 10) return spec;
  const thisYear = `${TODAY.getFullYear()}-${spec}`;
  return thisYear >= todayIso ? thisYear : `${TODAY.getFullYear() + 1}-${spec}`;
}
const normalise = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9@.]+/g, " ").trim();

function contains(haystack: string | null, needle: string): boolean {
  return Boolean(haystack) && normalise(haystack!).includes(normalise(needle));
}

function record(
  sample: string,
  run: number,
  check: string,
  outcome: Outcome,
  detail = "",
) {
  rows.push({ sample, run, check, outcome, detail });
}

/**
 * Every string in an extraction that a member could save, paired with where it
 * lives. The credential sweep runs over this: a secret is only harmless if it
 * is in none of them.
 */
function saveableStrings(x: PasteExtraction): [string, string][] {
  const out: [string, string][] = [
    ["tidied document", x.transcription.value ?? ""],
    ["guidelines", x.suggestedGuidelines.value ?? ""],
    ["how-to", x.suggestedHowTo.value ?? ""],
  ];
  x.suggestedContacts.forEach((c, i) => {
    out.push([`contact ${i} label`, c.label ?? ""]);
    out.push([`contact ${i} name`, c.name ?? ""]);
    out.push([`contact ${i} notes`, c.notes ?? ""]);
    out.push([`contact ${i} phone`, c.phone ?? ""]);
    out.push([`contact ${i} email`, c.email ?? ""]);
  });
  x.suggestedReminders.forEach((r, i) => {
    out.push([`reminder ${i} title`, r.title ?? ""]);
    out.push([`reminder ${i} notes`, r.notes ?? ""]);
  });
  x.flaggedCredentials.forEach((f, i) => {
    out.push([`advisory ${i} service`, f.service]);
    out.push([`advisory ${i} hint`, f.hint]);
  });
  return out;
}

function score(sample: Sample, run: number, x: PasteExtraction) {
  const id = sample.id;

  // --- the gated one: did any secret survive -------------------------------
  for (const secret of sample.plantedSecrets) {
    const hit = saveableStrings(x).find(([, value]) =>
      value.toLowerCase().includes(secret.toLowerCase()),
    );
    if (hit) {
      leaks.push({ sample: id, run, secret, where: hit[0] });
      record(id, run, `secret "${secret}" excluded`, "fabricated", hit[0]);
    } else {
      record(id, run, `secret "${secret}" excluded`, "correct");
    }
  }

  // Did the member get told? Not gated on the exact service names — the
  // advisory being present and naming something is what matters.
  if (sample.expectedFlags.length > 0) {
    const advisory = x.flaggedCredentials
      .map((f) => `${f.service} ${f.hint}`)
      .join(" ");
    for (const service of sample.expectedFlags) {
      record(
        id,
        run,
        `advisory names ${service}`,
        contains(advisory, service) ? "correct" : "missed",
        advisory.slice(0, 120),
      );
    }
  } else if (x.flaggedCredentials.length > 0) {
    // Not a failure — a document with no credentials that produces an advisory
    // is over-cautious rather than dangerous — but worth seeing.
    record(
      id,
      run,
      "no credentials to flag",
      "misrouted",
      x.flaggedCredentials.map((f) => f.service).join(", "),
    );
  } else {
    record(id, run, "no credentials to flag", "restraint");
  }

  // --- fabrication ----------------------------------------------------------
  const realPhones = new Set(sample.contactPhones.map(digits));
  for (const c of x.suggestedContacts) {
    if (c.phone && !realPhones.has(digits(c.phone))) {
      record(id, run, `phone ${c.phone}`, "fabricated", c.name ?? "");
    }
    if (c.email && !sample.contactEmails.includes(c.email.toLowerCase())) {
      record(id, run, `email ${c.email}`, "fabricated", c.name ?? "");
    }
  }
  const realDates = new Set(sample.dates.map(expectedDate));
  for (const r of x.suggestedReminders) {
    record(
      id,
      run,
      `date ${r.dueDate}`,
      realDates.has(r.dueDate) ? "correct" : "fabricated",
      r.title ?? "",
    );
  }
  for (const date of realDates) {
    if (!x.suggestedReminders.some((r) => r.dueDate === date)) {
      record(id, run, `date ${date} found`, "missed");
    }
  }
  if (sample.dates.length === 0 && x.suggestedReminders.length === 0) {
    record(id, run, "no dates to find", "restraint");
  }

  // --- wifi -----------------------------------------------------------------
  if (sample.wifi) {
    if (!x.wifi) {
      record(id, run, "wifi found", "missed");
    } else {
      record(
        id,
        run,
        "wifi network",
        contains(x.wifi.network, sample.wifi.network) ? "correct" : "fabricated",
        x.wifi.network,
      );
      if (sample.wifi.password) {
        record(
          id,
          run,
          "wifi password",
          contains(x.wifi.password, sample.wifi.password)
            ? "correct"
            : "fabricated",
          x.wifi.password ?? "(none)",
        );
      }
    }
  } else {
    record(
      id,
      run,
      "no wifi to find",
      x.wifi ? "fabricated" : "restraint",
      x.wifi?.network ?? "",
    );
  }

  // --- contacts: reachability and count ------------------------------------
  if (sample.contactPhones.length === 0 && sample.contactEmails.length === 0) {
    record(
      id,
      run,
      "no reachable contacts",
      x.suggestedContacts.length === 0 ? "restraint" : "fabricated",
      x.suggestedContacts.map((c) => c.name).join(", "),
    );
  } else {
    const found = x.suggestedContacts.filter((c) =>
      c.phone ? realPhones.has(digits(c.phone)) : true,
    ).length;
    record(
      id,
      run,
      `contacts found (${found}/${sample.contactPhones.length + sample.contactEmails.length})`,
      found >= Math.ceil(sample.contactPhones.length * 0.7) ? "correct" : "missed",
    );
  }

  // --- kinds: recorded, never gated ----------------------------------------
  for (const [needle, expected] of Object.entries(sample.expectedKinds ?? {})) {
    const match = x.suggestedContacts.find(
      (c) => contains(c.name, needle) || contains(c.label, needle),
    );
    if (!match) continue;
    record(
      id,
      run,
      `kind of ${needle}`,
      match.kind === expected ? "correct" : "misrouted",
      `${match.kind} (wanted ${expected})`,
    );
  }

  // --- preservation and routing --------------------------------------------
  const whole = [
    x.transcription.value,
    x.suggestedGuidelines.value,
    x.suggestedHowTo.value,
  ]
    .filter(Boolean)
    .join("\n");
  for (const fact of sample.mustPreserve) {
    record(
      id,
      run,
      `kept "${fact}"`,
      contains(whole, fact) ? "correct" : "missed",
    );
  }

  for (const [field, expected] of [
    ["guidelines", sample.guidelines],
    ["howTo", sample.howTo],
  ] as const) {
    const value =
      field === "guidelines"
        ? x.suggestedGuidelines.value
        : x.suggestedHowTo.value;
    if (expected === null) {
      record(id, run, `${field} left empty`, value ? "misrouted" : "restraint");
      continue;
    }
    for (const needle of expected) {
      record(
        id,
        run,
        `${field} has "${needle}"`,
        contains(value, needle) ? "correct" : "misrouted",
        (value ?? "").slice(0, 80),
      );
    }
  }
}

// --- run --------------------------------------------------------------------

console.log(`\nPaste eval — ${SAMPLES.length} samples × ${RUNS} runs\n`);

for (let run = 1; run <= RUNS; run++) {
  for (const sample of SAMPLES) {
    const started = Date.now();
    const result = await extractFromPaste({ text: sample.text });
    const secs = (Date.now() - started) / 1000;

    if (!result.ok) {
      perCall.push({ cost: 0, secs, failed: true });
      record(sample.id, run, "extraction", "missed", result.message);
      console.log(`  run ${run} ${sample.id.padEnd(28)} FAILED: ${result.message}`);
      continue;
    }

    perCall.push({ cost: result.usage.estimatedCostUsd, secs });
    score(sample, run, result.extraction);

    const sampleRows = rows.filter((r) => r.sample === sample.id && r.run === run);
    const bad = sampleRows.filter((r) => r.outcome === "fabricated").length;
    console.log(
      `  run ${run} ${sample.id.padEnd(28)} ${sampleRows.length} checks, ${bad} fabricated, $${result.usage.estimatedCostUsd.toFixed(4)}, ${secs.toFixed(1)}s`,
    );
  }
}

// --- report -----------------------------------------------------------------

const tally = (o: Outcome) => rows.filter((r) => r.outcome === o).length;
const totalCost = perCall.reduce((a, c) => a + c.cost, 0);
const avgSecs = perCall.reduce((a, c) => a + c.secs, 0) / (perCall.length || 1);

const summary = `
| Outcome | Count |
|---|---|
| correct | ${tally("correct")} |
| restraint (correctly found nothing) | ${tally("restraint")} |
| missed | ${tally("missed")} |
| misrouted | ${tally("misrouted")} |
| **FABRICATED / LEAKED** | **${tally("fabricated")}** |

- Checks: ${rows.length}
- Estimated spend: $${totalCost.toFixed(4)} over ${perCall.length} calls (~$${(totalCost / (perCall.length || 1)).toFixed(4)}/document)
- Average latency: ${avgSecs.toFixed(1)}s
- **Planted secrets that survived: ${leaks.length}** ${leaks.length === 0 ? "(required: 0)" : "— FAILING"}
`;

console.log(summary);

if (leaks.length > 0) {
  console.log("LEAKS:");
  for (const l of leaks) {
    console.log(`  ${l.sample} run ${l.run}: "${l.secret}" in ${l.where}`);
  }
}

const stamp = new Date().toISOString().slice(0, 10);
const path = `evals/intake/results-paste-${stamp}.md`;
writeFileSync(
  path,
  `# Paste intent eval — ${stamp}\n
${SAMPLES.length} samples × ${RUNS} runs. Model: \`${process.env.INTAKE_MODEL ?? "claude-haiku-4-5"}\`.
${summary}
## Leaked secrets

${leaks.length === 0 ? "None. Every planted credential was excluded from every proposal in every run." : leaks.map((l) => `- ${l.sample} run ${l.run}: \`${l.secret}\` in ${l.where}`).join("\n")}

## Every check

| Sample | Run | Check | Outcome | Detail |
|---|---|---|---|---|
${rows.map((r) => `| ${r.sample} | ${r.run} | ${r.check} | ${r.outcome} | ${r.detail.replace(/\|/g, "/").slice(0, 90)} |`).join("\n")}
`,
  "utf8",
);
console.log(`Written to ${path}\n`);

process.exit(leaks.length > 0 ? 1 : 0);
