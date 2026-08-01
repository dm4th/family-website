// Wi-Fi QR payload checks (PRD 36).
//
// The payload grammar is the one piece of the Wi-Fi panel that is pure logic
// with a sharp edge: `WIFI:` fields are semicolon-delimited, so an unescaped
// `;` or `:` in a password truncates the payload silently. The QR still
// renders, still scans, and joins with the wrong password — a failure nobody
// notices until someone is standing in the kitchen unable to get online.
//
// So the escaping is checked directly rather than by scanning phones. (The
// scan itself still gets a real-device walk; see the PRD's verification
// recipe.)
//
// Usage:
//   npx tsx evals/wifi/qr-payload-check.mts

import { buildWifiPayload, escapeWifiValue, wifiQrSvg } from "@/lib/wifi-qr";

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

console.log("\nescaping");
eq("plain text is untouched", escapeWifiValue("LoonASee"), "LoonASee");
eq("semicolon", escapeWifiValue("pass;word"), "pass\\;word");
eq("colon", escapeWifiValue("pass:word"), "pass\\:word");
eq("comma", escapeWifiValue("pass,word"), "pass\\,word");
eq("double quote", escapeWifiValue('pass"word'), 'pass\\"word');
eq("backslash", escapeWifiValue("pass\\word"), "pass\\\\word");
eq(
  "every special character at once",
  escapeWifiValue('a\\b;c,d:e"f'),
  'a\\\\b\\;c\\,d\\:e\\"f',
);

console.log("\npayload");
eq(
  "a normal WPA network",
  buildWifiPayload({ network: "Loon-A-See", password: "summer2026" }),
  "WIFI:T:WPA;S:Loon-A-See;P:summer2026;;",
);
eq(
  "a password with a semicolon stays one field",
  buildWifiPayload({ network: "Loon-A-See", password: "a;b" }),
  "WIFI:T:WPA;S:Loon-A-See;P:a\\;b;;",
);
eq(
  "a colon in the SSID is escaped too",
  buildWifiPayload({ network: "Loon:A:See", password: "x" }),
  "WIFI:T:WPA;S:Loon\\:A\\:See;P:x;;",
);
eq(
  "no password means an open network",
  buildWifiPayload({ network: "Loon-A-See", password: null }),
  "WIFI:T:nopass;S:Loon-A-See;;",
);
eq(
  "an empty-string password is also open",
  buildWifiPayload({ network: "Loon-A-See", password: "" }),
  "WIFI:T:nopass;S:Loon-A-See;;",
);

// A payload split on unescaped delimiters must yield exactly the fields we
// intend — this is the property that actually matters to a phone.
console.log("\nfield integrity");
const tricky = buildWifiPayload({
  network: "Looney Bin",
  password: 'p;a:s,s"w\\ord',
});
const fields = tricky
  .slice("WIFI:".length)
  // split on semicolons that are not preceded by a backslash
  .split(/(?<!\\);/)
  .filter((f) => f.length > 0);
eq("three fields survive the split", fields.length, 3);
eq("type field", fields[0], "T:WPA");
eq("ssid field", fields[1], "S:Looney Bin");
eq(
  "password field keeps every character, escaped",
  fields[2],
  'P:p\\;a\\:s\\,s\\"w\\\\ord',
);

console.log("\nsvg rendering");
const svg = await wifiQrSvg(tricky);
eq("renders an inline svg", svg?.startsWith("<svg") ?? false, true);
eq("no external references", /https?:\/\/(?!www\.w3\.org)/.test(svg ?? ""), false);
eq("no script tags", /<script/i.test(svg ?? ""), false);

console.log(
  `\n${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ""}\n`,
);
process.exit(failures ? 1 : 0);
