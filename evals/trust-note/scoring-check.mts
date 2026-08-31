// Trust notebook eval — scorer check (no API, no cost). PR #55.
//
// Reproduces the failures the first wild-corpus run surfaced, and pins the
// recalibrated scorer's behavior. Same role as intake's paste-parser-check:
// the part of the eval that can be verified without spending a token, is.
//
// Usage: npx tsx evals/trust-note/scoring-check.mts

import { digitSupported, groundedness, scoreKeyPoint, tokens } from "./scoring";

let failures = 0;

function check(name: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  if (!pass) failures += 1;
}

console.log("── tokenization ──");
check(
  "edge punctuation stripped: 'side.' matches 'side,'",
  tokens("a side.").includes("side") && tokens("staiks £500 a side,").includes("side"),
);
check(
  "short numbers survive the length filter",
  tokens("36 qts @ 4c = $1.44").includes("36") &&
    tokens("£500 a side").includes("500") &&
    tokens("36 qts @ 4c = $1.44").includes("1.44"),
  tokens("36 qts @ 4c = $1.44").join("|"),
);
check(
  "interior punctuation kept as a unit: 439.18.6 / 14,750 / 3.5%",
  tokens("£439.18.6 due").includes("439.18.6") &&
    tokens("payment $14,750 due").includes("14,750") &&
    tokens("rule 3.5% of value").includes("3.5"),
);
check(
  "trailing comma on a number: 'the 1041, then' matches 'file the 1041'",
  groundedness("file the 1041", "Granger says file the 1041, then call.") === 1,
);

console.log("── number formats (second wild run) ──");
check(
  "spaced pounds-shillings-pence: 439.18.6 supported by '£439. 18. 6'",
  digitSupported("439.18.6", "the sum of £439. 18. 6 at ninety days"),
);
check(
  "prefixed reference: 115 supported by 'No. M115'",
  digitSupported("115", "registered as No. M115 in the book"),
);
check(
  "wrong number still unsupported: 149 vs $1.44 / 36 qts",
  !digitSupported("149", "36 qts @ 4c = $1.44 received payment"),
);
check(
  "wrong year still unsupported: 1826 vs 1816",
  !digitSupported("1826", "dated Birmingham 1st November 1816"),
);
check(
  "wrong day still unsupported: 11 vs June 1, 1857",
  !digitSupported("11", "June 1, 1857. 36 qts @ 4c = $1.44"),
);
check(
  "scoreKeyPoint accepts a reshaped supported number",
  !scoreKeyPoint(
    { text: "A bill of exchange for 439.18.6 at ninety days.", sourceQuote: "£439. 18. 6" },
    "Pay to the order of P. Irving the sum of £439. 18. 6 at ninety days sight.",
  ).fabricated,
);

console.log("── the Sayers reproduction (was 0% groundedness, a false FABRICATED) ──");
const sayersTruth =
  "Sir, I aksep yor Chalang tue fite yu for £500 a side. staiks £500 a side, Tom Sayers.";
const sayersPoint = {
  text: "The stakes for the fight are set at £500 a side.",
  sourceQuote: "staiks £500 a side",
};
const sayers = scoreKeyPoint(sayersPoint, sayersTruth);
check(
  "verbatim quote scores grounded despite paraphrased point text",
  !sayers.fabricated,
  `grounded ${(sayers.grounded * 100).toFixed(0)}%, missing numbers [${sayers.missingNumbers.join(",")}]`,
);

console.log("── the gate still catches real fabrication ──");
const invented = scoreKeyPoint(
  {
    text: "Estimated payment $14,750 due with the filing.",
    sourceQuote: "payment due with the filing",
  },
  "Granger says file by April 15 as usual. Payment due with the filing.",
);
check(
  "a number absent from the truth gates even with a clean quote",
  invented.fabricated && invented.missingNumbers.includes("14,750"),
);
const madeUpQuote = scoreKeyPoint(
  {
    text: "The successor trustee is Lakeside Savings.",
    sourceQuote: "Lakeside Savings shall serve as successor trustee",
  },
  "Saturday - dock boards arriving 9am. Pick up bird seed. Chili for dinner.",
);
check("an ungrounded quote still gates", madeUpQuote.fabricated);
const noQuote = scoreKeyPoint(
  { text: "Meredith serves alone if Harold cannot.", sourceQuote: null },
  "If I can't serve - Meredith serves alone. Harold R. Birchwater.",
);
check("null quote falls back to point text (grounded case passes)", !noQuote.fabricated);

console.log(
  failures === 0 ? "\nSCORER CHECK: PASS" : `\nSCORER CHECK: FAIL (${failures})`,
);
process.exitCode = failures === 0 ? 0 : 1;
