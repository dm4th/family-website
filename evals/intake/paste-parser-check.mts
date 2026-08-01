// Paste parser checks (PRD 37) — the credential catch, without a model call.
//
// The eval next door measures whether the *model* behaves. This measures
// whether it matters if it doesn't. `parsePasteExtraction` is the boundary
// where a response becomes something a member can press Save on, and PRD 37's
// verification recipe asks for exactly this: "a crafted model response
// smuggling a password outside flaggedCredentials fails parsing or is dropped
// (test the parser directly)".
//
// So every case below is a hostile or careless response, hand-written. No API
// key, no cost, no flakiness — which also means this can run on every change,
// unlike the eval.
//
// Usage:
//   npx tsx evals/intake/paste-parser-check.mts

import {
  parsePasteExtraction,
  redactCredentials,
  type PasteExtraction,
} from "@/lib/intake/schema";

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

function eq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(label, a === e, `expected ${e}\n         actual   ${a}`);
}

/** Every string a member could end up saving out of one extraction. */
function proposedStrings(x: PasteExtraction): string[] {
  return [
    x.transcription.value ?? "",
    x.suggestedGuidelines.value ?? "",
    x.suggestedHowTo.value ?? "",
    ...x.suggestedContacts.flatMap((c) => [
      c.label ?? "",
      c.name ?? "",
      c.phone ?? "",
      c.email ?? "",
      c.notes ?? "",
    ]),
    ...x.suggestedReminders.flatMap((r) => [r.title ?? "", r.notes ?? ""]),
    ...x.flaggedCredentials.flatMap((f) => [f.service, f.hint]),
  ];
}

function leaks(x: PasteExtraction, secret: string): boolean {
  return proposedStrings(x).some((s) =>
    s.toLowerCase().includes(secret.toLowerCase()),
  );
}

// --- the redactor on its own ------------------------------------------------

console.log("\nredaction patterns");
for (const [label, line] of [
  ["colon separator", "Username: dmathieson"],
  ["password with colon", "Password: hunter2swordfish"],
  ["equals separator", "login=dmathieson99"],
  ["dash separator", "PIN - 4417"],
  ["the word is", "the alarm passcode is 90210"],
  ["bare space", "password hunter2swordfish"],
  ["bulleted", "● Account password: correcthorsebattery"],
  ["qualified label", "NH Electric account password: zaphod42"],
  ["access code", "Access code: 8891"],
  ["alarm code", "the alarm code is 9021"],
  // An all-lowercase username has none of a password's shape. The eval caught
  // this one leaking into a tidied document; identity labels get a stricter rule.
  ["plain lowercase username", "login mathiesonfamily"],
  ["username, no separator", "username dmath418"],
  // The Wi-Fi exception must be adjacency, not a keyword anywhere on the line.
  ["a wifi mention doesn't launder a later login", "The wifi is patchy upstairs. Account password: zaphod42"],
] as const) {
  const out = redactCredentials(line);
  check(
    `${label} redacted`,
    out.text.includes("[removed]") && out.found.length > 0,
    `got "${out.text}"`,
  );
}

console.log("\nwhat redaction must NOT touch");
for (const [label, line] of [
  ["wifi password", "WiFi password: pinecoveharbour"],
  ["wi-fi hyphenated", "Wi-Fi Password: summeratthelake"],
  ["network password", "Network password: loons2019"],
  ["guest network", "Guest network password: welcome123"],
  ["a mention with no value", "Ask Dad for the password"],
] as const) {
  const out = redactCredentials(line);
  check(`${label} left alone`, !out.text.includes("[removed]"), `got "${out.text}"`);
}

// --- the parser, given hostile responses ------------------------------------

console.log("\ncredentials smuggled outside flaggedCredentials");

const smuggled = parsePasteExtraction({
  transcription: {
    value:
      "## Utilities\n- NH Electric, account 4471. Username: dmathieson Password: hunter2swordfish\n- Dead River propane, call before the tank is low.",
    confidence: "high",
  },
  suggestedGuidelines: {
    value: "Strip the beds. The alarm code is 9021 if you set it.",
    confidence: "high",
  },
  suggestedHowTo: {
    value: "Water shut-off is by the road. Camera login: admin / pass: letmein",
    confidence: "high",
  },
  suggestedContacts: [
    {
      kind: "service",
      label: "Electric",
      name: "NH Electric",
      phone: "555-0142",
      email: null,
      notes: "Account 4471, password hunter2swordfish",
      confidence: "high",
    },
  ],
  suggestedReminders: [],
  wifi: null,
  flaggedCredentials: [],
});

check(
  "password gone from the tidied document",
  !leaks(smuggled, "hunter2swordfish"),
  JSON.stringify(smuggled.transcription.value),
);
check(
  "alarm code gone from guidelines",
  !leaks(smuggled, "9021"),
  JSON.stringify(smuggled.suggestedGuidelines.value),
);
check(
  "camera password gone from how-to",
  !leaks(smuggled, "letmein"),
  JSON.stringify(smuggled.suggestedHowTo.value),
);
check(
  "password gone from a contact's notes",
  !leaks(smuggled, "hunter2swordfish"),
  JSON.stringify(smuggled.suggestedContacts[0]?.notes),
);
check(
  "the member is still told something was found",
  smuggled.flaggedCredentials.length > 0,
  JSON.stringify(smuggled.flaggedCredentials),
);
check(
  "the account number itself survives (not a credential)",
  (smuggled.transcription.value ?? "").includes("4471"),
);
check(
  "the phone number survives",
  smuggled.suggestedContacts[0]?.phone === "555-0142",
);

console.log("\nthe hint itself must not carry the secret");
const chattyHint = parsePasteExtraction({
  transcription: { value: "Nothing much here.", confidence: "high" },
  suggestedGuidelines: { value: null, confidence: "low" },
  suggestedHowTo: { value: null, confidence: "low" },
  suggestedContacts: [],
  suggestedReminders: [],
  wifi: null,
  flaggedCredentials: [
    { service: "NH Electric", hint: "password: hunter2swordfish" },
  ],
});
check(
  "a helpful hint is redacted too",
  !leaks(chattyHint, "hunter2swordfish"),
  JSON.stringify(chattyHint.flaggedCredentials),
);

console.log("\nthe Wi-Fi exception");
const withWifi = parsePasteExtraction({
  transcription: { value: "WiFi password: pinecoveharbour", confidence: "high" },
  suggestedGuidelines: { value: null, confidence: "low" },
  suggestedHowTo: { value: null, confidence: "low" },
  suggestedContacts: [],
  suggestedReminders: [],
  wifi: { network: "LoonASee", password: "pinecoveharbour", confidence: "high" },
  flaggedCredentials: [],
});
eq("network kept", withWifi.wifi?.network, "LoonASee");
eq("passphrase kept", withWifi.wifi?.password, "pinecoveharbour");
check(
  "and it survives in the tidied text as well",
  (withWifi.transcription.value ?? "").includes("pinecoveharbour"),
);

console.log("\nwifi restraint");
eq(
  "a password with no network is not a proposal",
  parsePasteExtraction({ wifi: { network: null, password: "x", confidence: "high" } })
    .wifi,
  null,
);
eq("null wifi stays null", parsePasteExtraction({ wifi: null }).wifi, null);

console.log("\nanti-fabrication, same rules as note and dictation");
const contacts = parsePasteExtraction({
  suggestedContacts: [
    {
      kind: "service",
      label: "Plumber",
      name: "Dave",
      phone: "5550142",
      email: null,
      confidence: "high",
    },
    // no phone, no email — a name we misread, not a record
    {
      kind: "on_the_ground",
      label: "Neighbour",
      name: "Someone",
      phone: null,
      email: null,
      confidence: "low",
    },
  ],
}).suggestedContacts;
eq("unreachable contact dropped", contacts.length, 1);
eq("reachable one kept", contacts[0]?.name, "Dave");

eq(
  "a bogus kind lands on the ground",
  parsePasteExtraction({
    suggestedContacts: [
      { kind: "plumber", label: "P", phone: "5550142", confidence: "high" },
    ],
  }).suggestedContacts[0]?.kind,
  "on_the_ground",
);

const dates = parsePasteExtraction({
  suggestedReminders: [
    { title: "Real", statedAs: "by 15 March 2027", dueDate: "2027-03-15", recurrence: "none", confidence: "high" },
    { title: "Impossible", statedAs: "30 February 2027", dueDate: "2027-02-30", recurrence: "none", confidence: "high" },
    { title: "Vague", statedAs: "in the spring", dueDate: "in the spring", recurrence: "none", confidence: "low" },
  ],
}).suggestedReminders;
eq("only real calendar days survive", dates.map((d) => d.dueDate), ["2027-03-15"]);

console.log("\na date must be quoted from words that name a day");
const quoted = parsePasteExtraction({
  suggestedReminders: [
    // The exact failure the eval caught: a month with no day, resolved to the 1st.
    { title: "Snow plough bill", statedAs: "they bill in April", dueDate: "2027-04-01", recurrence: "none", confidence: "medium" },
    // No quote at all: nobody is vouching for this one.
    { title: "Unsourced", statedAs: null, dueDate: "2027-05-03", recurrence: "none", confidence: "high" },
    // Spelled-out ordinals are how people write dates too.
    { title: "Spelled out", statedAs: "on the fifteenth of June", dueDate: "2027-06-15", recurrence: "none", confidence: "high" },
    { title: "Numeral", statedAs: "by 10 October 2027", dueDate: "2027-10-10", recurrence: "none", confidence: "high" },
  ],
}).suggestedReminders;
eq(
  "only dates quoted from a stated day survive",
  quoted.map((d) => d.dueDate),
  ["2027-06-15", "2027-10-10"],
);

console.log("\nnothing outside the schema can be proposed");
const junk = parsePasteExtraction({
  status: "inactive",
  max_guests: 99,
  hero_image_path: "evil.jpg",
  peak_period_ranges: [],
  transcription: { value: "hello", confidence: "high" },
}) as unknown as Record<string, unknown>;
eq(
  "privileged property columns are not in the result",
  ["status", "max_guests", "hero_image_path", "peak_period_ranges"].filter(
    (k) => k in junk,
  ),
  [],
);

console.log("\ngarbage in");
const empty = parsePasteExtraction(null);
eq("null response is an empty extraction", empty.suggestedContacts.length, 0);
eq("no wifi", empty.wifi, null);
eq("no credentials", empty.flaggedCredentials.length, 0);

console.log(
  `\n${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ""}\n`,
);
process.exit(failures ? 1 : 0);
