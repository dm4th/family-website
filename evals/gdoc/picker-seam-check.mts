// Google Doc picker seam checks (PRD 38) — no browser, no network, no cost.
//
// The picker itself can only really be verified live, and PRD 38 says so. But
// two things around it can break silently, months later, in a change that has
// nothing to do with this feature:
//
//   1. **The scope.** `drive.file` is what makes this door safe: the picker is
//      the grant, so the app sees exactly the one file the member chose and can
//      never list the rest of their Drive. Widening it to `drive.readonly`
//      would still work perfectly — that is precisely the problem. Nothing in a
//      live walk would look different.
//   2. **The CSP.** The door needs three Google hosts allowed (PRD 28's policy
//      is deliberately tight). Tightening it further is a good instinct that
//      would break this feature with a console error nobody is watching for.
//
// Neither is caught by tsc, by the build, or by the paste eval. So they are
// caught here.
//
// Usage:
//   npx tsx evals/gdoc/picker-seam-check.mts

import { readFileSync } from "node:fs";

import { DOCS_PICKER_SCOPE, GOOGLE_DOC_MIME } from "@/lib/google/docs-picker";

let failures = 0;
let checks = 0;

function check(label: string, ok: boolean, detail = "") {
  checks += 1;
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? `\n         ${detail}` : ""}`);
  }
}

console.log("\nthe scope is the safety property");
check(
  "drive.file, the narrowest scope that can do this job",
  DOCS_PICKER_SCOPE === "https://www.googleapis.com/auth/drive.file",
  `got "${DOCS_PICKER_SCOPE}"`,
);
check(
  "and specifically not a scope that can read the whole Drive",
  !/drive\.readonly|auth\/drive$|drive\.metadata/.test(DOCS_PICKER_SCOPE),
  `got "${DOCS_PICKER_SCOPE}"`,
);
check(
  "Google Docs only, not Sheets or Slides",
  GOOGLE_DOC_MIME === "application/vnd.google-apps.document",
  `got "${GOOGLE_DOC_MIME}"`,
);

console.log("\nthe picker's hosts survive in the CSP");
// Read as text rather than importing: next.config.ts builds the policy inline
// and doesn't export it, and this check shouldn't force a shape change on the
// config to make itself possible.
const config = readFileSync("next.config.ts", "utf8");

function directive(name: string): string {
  // Each directive is one backtick-quoted line in the `csp` array.
  const match = new RegExp(`\`${name} ([^\`]*)\``).exec(config);
  return match?.[1] ?? "";
}

for (const [name, host, why] of [
  ["script-src", "https://apis.google.com", "gapi and the Picker library"],
  ["connect-src", "https://www.googleapis.com", "the Drive text export"],
  ["frame-src", "https://docs.google.com", "the picker's own iframe"],
] as const) {
  const value = directive(name);
  check(
    `${name} allows ${host} (${why})`,
    value.includes(host),
    `${name} is "${value}"`,
  );
}

console.log("\nwhat the CSP must still refuse");
check(
  "connect-src is not a wildcard",
  !/connect-src[^`]*\s\*(\s|$)/.test(config),
);
check(
  "frame-ancestors stays none",
  directive("frame-ancestors").trim() === "'none'",
  `got "${directive("frame-ancestors")}"`,
);

console.log(
  `\n${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ""}\n`,
);
process.exit(failures ? 1 : 0);
