// Recurrence expansion checks (PRD 32, slice 3).
//
// The date math in src/lib/reminders.ts is the one piece of slice 3 that is pure
// logic with sharp edges — month-end clamping, windows that start mid-repeat,
// occurrences that must not exist before the due date. It is also the piece
// nobody will notice is wrong until a bill is missed, because a reminder that
// silently fails to appear looks exactly like a month with no bill.
//
// So it gets checked directly rather than by clicking through a calendar. The
// same function feeds the property calendar, the unified calendar, and the ICS
// feed, so a bug here is a bug in all three.
//
// Usage:
//   npx tsx evals/reminders/recurrence-check.mts

import {
  expandOccurrences,
  nextOccurrence,
  parseYmd,
} from "@/lib/reminders";

let failures = 0;
let checks = 0;

function eq(label: string, actual: unknown, expected: unknown) {
  checks += 1;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}\n         expected ${e}\n         actual   ${a}`);
  }
}

console.log("\nOne-off reminders");
eq(
  "inside the window",
  expandOccurrences("2026-08-15", "none", "2026-08-01", "2026-08-31"),
  ["2026-08-15"],
);
eq(
  "outside the window",
  expandOccurrences("2026-09-15", "none", "2026-08-01", "2026-08-31"),
  [],
);
eq(
  "on the window's first day",
  expandOccurrences("2026-08-01", "none", "2026-08-01", "2026-08-31"),
  ["2026-08-01"],
);
eq(
  "on the window's last day",
  expandOccurrences("2026-08-31", "none", "2026-08-01", "2026-08-31"),
  ["2026-08-31"],
);

console.log("\nMonthly");
eq(
  "every month of a quarter",
  expandOccurrences("2026-08-15", "monthly", "2026-08-01", "2026-10-31"),
  ["2026-08-15", "2026-09-15", "2026-10-15"],
);
eq(
  "a repeat set years ago still lands in this month",
  expandOccurrences("2020-03-10", "monthly", "2026-08-01", "2026-08-31"),
  ["2026-08-10"],
);
eq(
  "nothing before the due date",
  expandOccurrences("2026-08-15", "monthly", "2026-01-01", "2026-07-31"),
  [],
);
eq(
  "crosses a year boundary",
  expandOccurrences("2026-11-20", "monthly", "2026-12-01", "2027-02-28"),
  ["2026-12-20", "2027-01-20", "2027-02-20"],
);

console.log("\nMonth-end clamping (the 31st problem)");
eq(
  "the 31st clamps into February and recovers after",
  expandOccurrences("2027-01-31", "monthly", "2027-01-01", "2027-05-31"),
  ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31"],
);
eq(
  "the 31st in a leap February",
  expandOccurrences("2028-01-31", "monthly", "2028-02-01", "2028-02-29"),
  ["2028-02-29"],
);
eq(
  "the 30th clamps in February only",
  expandOccurrences("2027-01-30", "monthly", "2027-02-01", "2027-03-31"),
  ["2027-02-28", "2027-03-30"],
);
eq(
  "clamping never drifts — always measured from the anchor",
  expandOccurrences("2027-01-31", "monthly", "2027-06-01", "2027-06-30"),
  ["2027-06-30"],
);

console.log("\nQuarterly and annual");
eq(
  "quarterly across a year",
  expandOccurrences("2026-02-10", "quarterly", "2026-01-01", "2026-12-31"),
  ["2026-02-10", "2026-05-10", "2026-08-10", "2026-11-10"],
);
eq(
  "annually",
  expandOccurrences("2026-06-30", "annually", "2026-01-01", "2029-01-01"),
  ["2026-06-30", "2027-06-30", "2028-06-30"],
);
eq(
  "annually on Feb 29 clamps in common years",
  expandOccurrences("2028-02-29", "annually", "2029-01-01", "2029-12-31"),
  ["2029-02-28"],
);

console.log("\nWindow edges");
eq(
  "a single-day window that is an occurrence",
  expandOccurrences("2026-08-15", "monthly", "2026-09-15", "2026-09-15"),
  ["2026-09-15"],
);
eq(
  "a single-day window that is not",
  expandOccurrences("2026-08-15", "monthly", "2026-09-16", "2026-09-16"),
  [],
);
eq(
  "an inverted window yields nothing",
  expandOccurrences("2026-08-15", "monthly", "2026-09-01", "2026-08-01"),
  [],
);

console.log("\nBad input is refused, not guessed");
eq("a date that does not exist", parseYmd("2026-02-31"), null);
eq("a month that does not exist", parseYmd("2026-13-01"), null);
eq("free text", parseYmd("next tuesday"), null);
eq(
  "an unparseable due date expands to nothing",
  expandOccurrences("not-a-date", "monthly", "2026-01-01", "2026-12-31"),
  [],
);

console.log("\nnextOccurrence");
eq(
  "the next monthly hit after today",
  nextOccurrence("2026-08-15", "monthly", "2026-09-20"),
  "2026-10-15",
);
eq(
  "today itself counts as next",
  nextOccurrence("2026-08-15", "monthly", "2026-09-15"),
  "2026-09-15",
);
eq(
  "a one-off already past has no next",
  nextOccurrence("2026-08-15", "none", "2026-09-01"),
  null,
);
eq(
  "a one-off still ahead",
  nextOccurrence("2026-08-15", "none", "2026-08-01"),
  "2026-08-15",
);

console.log(
  `\n${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ""}\n`,
);
process.exit(failures ? 1 : 0);
