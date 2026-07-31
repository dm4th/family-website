// Smart Intake extraction schemas (PRD 32).
//
// Browser-safe: no server-only imports, so the upload picker and the review
// form can share the size cap, the accepted file types, and the shape of what
// the model gives back.
//
// One schema per intent. Slice 1 ships "contact" (a vendor off a bill, plus the
// service address when one is clearly present); slice 2 adds "note" (Dad's
// handwriting, routed by the member into guidelines / how-to / contacts). Slice
// 3 adds "calendar" here — the pipeline around this file is deliberately
// intent-driven so a new target adds a schema and a review form, not a new path.

import {
  RECURRENCE_VALUES,
  isReminderRecurrence,
  parseYmd,
  type ReminderRecurrence,
} from "@/lib/reminders";

export type IntakeIntent = "contact" | "note" | "calendar" | "dictation";

export const INTAKE_INTENTS: IntakeIntent[] = [
  "contact",
  "note",
  "calendar",
  "dictation",
];

/**
 * Intents that read an uploaded image or PDF. `dictation` is the odd one out —
 * its input is text the member spoke — so anywhere the pipeline assumes a
 * document (the upload picker, `extractIntake`'s path and MIME checks) should
 * gate on this rather than on the full list.
 */
export type DocumentIntent = Exclude<IntakeIntent, "dictation">;

export const DOCUMENT_INTENTS: DocumentIntent[] = [
  "contact",
  "note",
  "calendar",
];

export function isDocumentIntent(value: unknown): value is DocumentIntent {
  return (
    typeof value === "string" && (DOCUMENT_INTENTS as string[]).includes(value)
  );
}

export function isIntakeIntent(value: unknown): value is IntakeIntent {
  return (
    typeof value === "string" &&
    (INTAKE_INTENTS as string[]).includes(value)
  );
}

/**
 * How sure the model is about a single field. The UI flags anything below
 * "high" so the member's eye goes to the fields most likely to be wrong; it
 * never hides or auto-commits a value on this basis.
 */
export type FieldConfidence = "high" | "medium" | "low";

export type ExtractedField = {
  value: string | null;
  confidence: FieldConfidence;
};

export type ContactFieldKey =
  | "label"
  | "name"
  | "phone"
  | "email"
  | "notes"
  | "address";

export type ContactExtraction = {
  fields: Record<ContactFieldKey, ExtractedField>;
  /** The model's plain-text read of the document, for the "what did it see?" panel. */
  rawText: string;
};

export const CONTACT_FIELD_KEYS: ContactFieldKey[] = [
  "label",
  "name",
  "phone",
  "email",
  "notes",
  "address",
];

// --- Note intent (slice 2) -------------------------------------------------

/**
 * A person the note mentions, offered as a pre-filled contact. One confidence
 * for the whole suggestion rather than per field: on a handwritten note the
 * whole line is legible or it isn't, and a five-way confidence breakdown on
 * something we're only *offering* is more noise than help.
 */
export type SuggestedContact = {
  label: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  confidence: FieldConfidence;
};

export type NoteExtraction = {
  /** The model's cleaned-up read of the whole note. The member edits this directly. */
  transcription: ExtractedField;
  /** Rules and expectations for people staying, if the note holds any. */
  suggestedGuidelines: ExtractedField;
  /** Practical operating instructions (water shut-off, gate code, heat). */
  suggestedHowTo: ExtractedField;
  /** People named with enough detail to be worth offering as contacts. */
  suggestedContacts: SuggestedContact[];
};

/** Ceiling on offered contacts. A note listing more than this is really a list. */
export const MAX_SUGGESTED_CONTACTS = 6;

// --- Calendar intent (slice 3) ---------------------------------------------

/**
 * A dated obligation read off a bill, offered as a pre-filled reminder.
 *
 * `dueDate` is the whole point, so it is the one thing that is not optional: a
 * suggestion whose date we can't resolve to a real calendar day is dropped in
 * `parseCalendarExtraction` rather than offered with a blank box. "No due date
 * found means no reminder offered" is a PRD requirement, and the alternative —
 * a half-filled form that looks like we found something — is worse than nothing
 * for a member who is trusting the read.
 *
 * `amount` is deliberately a string, not a number: it is displayed and stored as
 * text in the reminder's notes. Reminders are not a ledger (PRD 32 puts
 * payments explicitly out of scope), and parsing "$1,204.55" into a float would
 * imply an arithmetic we never do.
 */
export type SuggestedReminder = {
  title: string | null;
  dueDate: string; // YYYY-MM-DD, already validated against the real calendar
  amount: string | null;
  notes: string | null;
  recurrence: ReminderRecurrence;
  confidence: FieldConfidence;
  /**
   * How the date was said out loud, when it came from speech: "the fifteenth",
   * "next Friday". Only ever set by the dictation intent, where the date on the
   * form is a *resolution* of relative words rather than a value copied off a
   * page. Showing the member the phrase next to the date is what makes that
   * resolution checkable — see `DICTATION_EXTRACTION_PROMPT`.
   */
  spokenAs?: string | null;
};

export type CalendarExtraction = {
  reminders: SuggestedReminder[];
  /** The model's plain-text read, for the "what did it see?" panel. */
  rawText: string;
};

/**
 * Ceiling on offered reminders. A bill has one due date; an installment notice
 * might list four. More than that and we're reading a statement of account, not
 * a thing to be reminded about.
 */
export const MAX_SUGGESTED_REMINDERS = 4;

// --- Dictation intent (PRD 34) ---------------------------------------------

/**
 * What a spoken session produces.
 *
 * Deliberately the note extraction plus reminders, rather than a shape of its
 * own. PRD 34 describes dictation as "a note without a photo", and the note
 * review screen already does the thing dictation needs: show the text back, then
 * walk the member through each place it could go, one gated save at a time.
 * Matching the shape is what lets that screen render this with no fork.
 *
 * `transcription` carries the *tidied* version — punctuated, paragraphed, filler
 * removed. The member's literal words are not lost by that: the raw transcript is
 * what gets stored in the bucket, so the retention panel can always show what was
 * actually said.
 */
export type DictationExtraction = NoteExtraction & {
  suggestedReminders: SuggestedReminder[];
};

/**
 * Ceiling on how much speech we send in one go — a few minutes of talking. The
 * cap exists because the textarea accepts a paste as readily as a dictation, and
 * an unbounded box is an unbounded bill.
 */
export const MAX_DICTATION_CHARS = 6000;

/**
 * Below this there is nothing to tidy, and a stray tap shouldn't spend a model
 * call.
 */
export const MIN_DICTATION_CHARS = 12;

/**
 * Room for the cleaned-up read of a full dictation. Larger than the note
 * intent's prose cap on purpose: tidying can only be trusted if it doesn't
 * silently drop the end of what someone said, and the input cap above is the
 * real limit.
 */
const MAX_DICTATION_PROSE_CHARS = 10000;

// --- Upload guardrails -----------------------------------------------------

export const INTAKE_BUCKET = "intake";

/**
 * Ceiling at the picker. A phone photo of a bill is well under this; the cap
 * exists so one bad file can't push a large payload through the vision call.
 */
export const MAX_INTAKE_BYTES = 10 * 1024 * 1024;

/**
 * Long-edge cap for an intake photo, deliberately smaller than the photo
 * archive's 2048.
 *
 * Vision cost is driven by pixel area, and measured on a real bill the 2048px
 * upload cost roughly a third more than the same page at 1500px with no
 * difference in what was read. Going lower still (1000px) also read correctly
 * but leaves no headroom for the harder inputs this feature exists for:
 * handwriting, creased paper, a photo taken at an angle. 1500 is the balance.
 */
export const INTAKE_MAX_DIMENSION = 1500;

/**
 * Types the vision model can actually read. HEIC is deliberately absent: iOS
 * converts to JPEG on upload in practice, and a HEIC that slips through would
 * fail server-side with a confusing error rather than a clear one here.
 */
export const INTAKE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;

export type IntakeMimeType = (typeof INTAKE_MIME_TYPES)[number];

export function isAllowedIntakeMime(mime: string): mime is IntakeMimeType {
  return (INTAKE_MIME_TYPES as readonly string[]).includes(mime.toLowerCase());
}

/**
 * Storage path for an uploaded source document. Two-level partitioning by the
 * leading hex pair, same convention as the photos bucket.
 */
export function generateIntakePath(originalName: string): string {
  const ext = inferIntakeExtension(originalName);
  const id = crypto.randomUUID();
  return `${id.slice(0, 2)}/${id}${ext}`;
}

/**
 * Storage path for a stored dictation transcript. Same partitioning as photos,
 * so PRD 33's retention panel — its listing, its signed-URL open, its delete —
 * covers a spoken session without knowing it isn't an image.
 *
 * Separate from `generateIntakePath` rather than an extra extension on it,
 * because `.txt` must not become an acceptable target for the vision path: this
 * one is only ever called server-side, with text the server is about to write.
 */
export function generateIntakeTextPath(): string {
  const id = crypto.randomUUID();
  return `${id.slice(0, 2)}/${id}.txt`;
}

/**
 * Server-side guard so a caller can't point an extraction at an arbitrary
 * object in the bucket.
 */
export function isValidIntakePath(path: string): boolean {
  return /^[0-9a-f]{2}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif|pdf)$/i.test(path);
}

function inferIntakeExtension(originalName: string): string {
  const dot = originalName.lastIndexOf(".");
  const ext = dot > 0 ? originalName.slice(dot).toLowerCase() : "";
  return /^\.(jpg|jpeg|png|webp|gif|pdf)$/.test(ext) ? ext : ".jpg";
}

// --- Model-facing JSON schema ---------------------------------------------

const FIELD_SCHEMA = (description: string) => ({
  type: "object",
  description,
  properties: {
    value: {
      type: ["string", "null"],
      description: "The extracted text, or null if the document doesn't show it.",
    },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
      description:
        "high = read cleanly and unambiguously; medium = legible but inferred or partially obscured; low = a guess.",
    },
  },
  required: ["value", "confidence"],
  additionalProperties: false,
});

/**
 * The structured-output schema handed to the model. Every field is required so
 * the response shape is predictable; "not present in the document" is expressed
 * as a null `value`, never as a missing key.
 */
export const CONTACT_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    fields: {
      type: "object",
      properties: {
        label: FIELD_SCHEMA(
          'What kind of contact this is, in two or three words: "Electric utility", "Home insurance", "Property tax". Not the company name.',
        ),
        name: FIELD_SCHEMA(
          'The company or person being contacted, e.g. "Pacific Gas & Electric".',
        ),
        phone: FIELD_SCHEMA(
          "The customer service or billing phone number, as printed.",
        ),
        email: FIELD_SCHEMA("A billing or support email address, if printed."),
        notes: FIELD_SCHEMA(
          "A short free-text line holding the account or policy number, the billing period, and the amount due, if shown. Plain text, one line.",
        ),
        address: FIELD_SCHEMA(
          "The service address the bill is FOR (the property), not the vendor's mailing address. Null unless you are confident which one it is.",
        ),
      },
      required: ["label", "name", "phone", "email", "notes", "address"],
      additionalProperties: false,
    },
    rawText: {
      type: "string",
      description:
        "Your plain-text read of the document, so a person can check your work. Keep it under 2000 characters.",
    },
  },
  required: ["fields", "rawText"],
  additionalProperties: false,
} as const;

export const CONTACT_EXTRACTION_PROMPT = `You are reading a photograph or scan of a household document for a family's property records: a utility bill, an insurance statement, a tax notice, or a handwritten note.

Pull out the vendor's contact details so a family member can confirm them and save them. Rules:

- Copy what the document says. Never invent, complete, or "correct" a value you cannot read. If the document doesn't show something, return null for it.
- Mark confidence honestly. Use "low" for anything blurry, handwritten, cropped, or inferred. A person reviews every field, so an honest "low" is far more useful than a confident guess.
- The service address is the address the bill is FOR. If you cannot tell it apart from the vendor's own mailing address, return null.
- Put the account or policy number, the billing period, and the amount due together in "notes" as one short plain-text line.
- Do not describe the image, add commentary, or return anything outside the schema.`;

/**
 * The note schema. No `rawText` here, unlike the contact intent: on a note the
 * transcription *is* the raw read, so asking for both would pay twice for the
 * same output tokens and give the member two texts to reconcile.
 */
export const NOTE_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    transcription: FIELD_SCHEMA(
      "Your best plain-text read of the whole note, line by line, keeping the writer's own words and order. Use [?] in place of a word you genuinely cannot make out. Never leave this null; if the page is unreadable, say so in the text and mark confidence low.",
    ),
    suggestedGuidelines: FIELD_SCHEMA(
      'The parts of the note that are rules or expectations for people staying, e.g. "no shoes upstairs", "strip the beds before you leave". Null if the note has none. Copy the writer\'s wording.',
    ),
    suggestedHowTo: FIELD_SCHEMA(
      'The parts of the note that explain how to operate the place, e.g. "water shut-off is at the road", "gate code is round back", "flip the breaker in the shed". Null if the note has none. Copy the writer\'s wording.',
    ),
    suggestedContacts: {
      type: "array",
      // No `maxItems` here: structured outputs reject it on an array with a 400
      // ("For 'array' type, property 'maxItems' is not supported"), which fails
      // the whole request rather than the one constraint. The cap is stated in
      // the description for the model and enforced for real in
      // `parseNoteExtraction`, which is where it needs to be trustworthy anyway.
      // "With a phone number or an email" is a deliberate hard requirement, not
      // a preference. Measured on a real handwritten document that names people
      // but lists no way to reach them, a looser rule ("a name and a clear
      // trade") produced confident contacts off misread surnames — four
      // different readings of the same name across runs. A name we can't reach
      // isn't a useful contact record anyway, so requiring a number costs
      // nothing and removes the whole failure mode.
      description: `People or companies the note names AND gives a phone number or an email address for. Do not include someone the note merely mentions with no way to contact them. An empty array if the note names nobody reachable. At most ${MAX_SUGGESTED_CONTACTS}.`,
      items: {
        type: "object",
        properties: {
          label: {
            type: ["string", "null"],
            description:
              'What they do, in two or three words: "Plumber", "Snow removal", "Caretaker".',
          },
          name: {
            type: ["string", "null"],
            description: "Their name or company as written.",
          },
          phone: {
            type: ["string", "null"],
            description: "Their phone number exactly as written, or null.",
          },
          email: {
            type: ["string", "null"],
            description: "Their email address, or null.",
          },
          notes: {
            type: ["string", "null"],
            description:
              "Anything else the note says about them, in one short line.",
          },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
            description:
              "How sure you are of this whole suggestion. Use low for anything you had to guess at.",
          },
        },
        required: ["label", "name", "phone", "email", "notes", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "transcription",
    "suggestedGuidelines",
    "suggestedHowTo",
    "suggestedContacts",
  ],
  additionalProperties: false,
} as const;

export const NOTE_EXTRACTION_PROMPT = `You are reading a photograph of a handwritten or typed note about a family's holiday property. It was probably written quickly, for the writer's own use, and may be untidy.

Transcribe it, then sort what it says into the places it belongs. Rules:

- Transcribe what is on the page. Keep the writer's own words, spelling, and order. Do not tidy their phrasing, expand their abbreviations, or add anything they did not write.
- Where a word is genuinely illegible, write [?] rather than guessing. One honest [?] is far more useful than a plausible wrong word, because a person is about to read this against the original.
- Handwriting is hard. Be honest with confidence and use "low" freely. "Medium" or "low" costs the reader a second look; a wrong "high" costs them a wrong record.
- Never invent a phone number, an email address, or a name. If you cannot read a digit, leave the whole number null rather than filling the gap.
- Only offer someone as a contact if the note gives a phone number or an email for them. A name with no way to reach it is not a contact.
- A line can belong in more than one place: a note that says "gate code 4417, tell the plumber Jim 555-1234" gives you a how-to line AND a contact.
- "Guidelines" is what people staying are asked to do; "how to" is how the building works. When a line could be either, put it in the one it fits best and don't repeat it in both.
- Leave a section null when the note simply doesn't cover it. An empty section is a correct answer, not a failure.
- Do not describe the image, add commentary, or return anything outside the schema.`;

/**
 * The calendar schema. Keeps `rawText` (unlike the note intent) because a bill
 * is dense and mostly irrelevant: the member is confirming three or four values
 * pulled out of a page of small print, and wants to see what we read them from.
 */
export const CALENDAR_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    reminders: {
      type: "array",
      // No `maxItems` — structured outputs reject it on an array with a 400.
      // Capped for real in `parseCalendarExtraction`. (Same finding as slice 2.)
      description: `Dates this document says something must be paid or done by. An empty array if it shows no due date at all. At most ${MAX_SUGGESTED_REMINDERS}.`,
      items: {
        type: "object",
        properties: {
          title: {
            type: ["string", "null"],
            description:
              'What the payment is for, in two or three words a family would recognise: "Water bill", "Home insurance", "Property tax". Not the full vendor name, and not the word "Bill" on its own.',
          },
          dueDate: {
            type: ["string", "null"],
            description:
              "The due date as YYYY-MM-DD. If the document prints a day and month but no year, work the year out from the statement or billing date printed on the same document. If you cannot establish the year that way, return null rather than assuming the current one. Return null if no due date is shown.",
          },
          amount: {
            type: ["string", "null"],
            description:
              'The amount due, exactly as printed including the currency symbol, e.g. "$412.30". Null if no amount is shown.',
          },
          notes: {
            type: ["string", "null"],
            description:
              "The account or policy number and the billing period, in one short plain-text line. Do not repeat the amount here.",
          },
          recurrence: {
            type: "string",
            enum: RECURRENCE_VALUES,
            description:
              'How often this recurs, but ONLY if the document says so — "monthly statement", "quarterly premium", "annual renewal". If it does not say, answer "none". Do not infer a repeat from the kind of bill it appears to be.',
          },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
            description:
              "How sure you are of the date above specifically. Use low for anything you had to work out rather than read.",
          },
        },
        required: [
          "title",
          "dueDate",
          "amount",
          "notes",
          "recurrence",
          "confidence",
        ],
        additionalProperties: false,
      },
    },
    rawText: {
      type: "string",
      description:
        "Your plain-text read of the document, so a person can check your work. Keep it under 2000 characters.",
    },
  },
  required: ["reminders", "rawText"],
  additionalProperties: false,
} as const;

export const CALENDAR_EXTRACTION_PROMPT = `You are reading a photograph or scan of a household bill, statement, or notice for a family's property records.

Find the dates by which something must be paid or done, so a family member can confirm them and put them on the calendar. Rules:

- A due date is a deadline the document sets. A statement date, a billing period, a meter reading date, and a "payments received by" date are NOT due dates. If the document sets no deadline, return an empty list. That is a correct answer.
- Give the date as YYYY-MM-DD. If the year is not printed next to the day and month, work it out from the statement or billing date on the same document. If you cannot, return null for the date rather than guessing a year, and do not fall back to the current year.
- Never invent a date, an amount, or an account number. Copy what is printed.
- Only set a recurrence if the document itself says the charge repeats. "Monthly statement" or "annual premium" is evidence; a water bill merely looking like a water bill is not. When in doubt answer "none" — a member can set a repeat in one click, but a repeat nobody asked for puts a wrong entry on the calendar every month.
- Title it the way a family would say it out loud: "Water bill", not "Municipal Water & Sewer Authority Consolidated Statement".
- Be honest with confidence, and use "low" for any date you worked out rather than read directly.
- Do not describe the image, add commentary, or return anything outside the schema.`;

/**
 * The dictation schema: the note schema's four keys plus reminders.
 *
 * Reminders are part of *this* extraction rather than a second pass, unlike the
 * photo intents' "also check this document for a due date" offer. A photo is
 * still in the bucket to be re-read; a sentence like "remind me the propane is
 * due on the fifteenth" is inseparable from the rest of what was said, and
 * asking twice would mean paying twice to read the same paragraph.
 */
export const DICTATION_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    transcription: FIELD_SCHEMA(
      "The whole dictation, tidied into clean markdown: sentences punctuated, filler words removed, self-corrections resolved to what the speaker settled on, related lines grouped under short ## headings or bullet lists where that helps. Keep every fact, name, number, and instruction they gave. Never leave this null.",
    ),
    suggestedGuidelines: FIELD_SCHEMA(
      'The parts that are rules or expectations for people staying, e.g. "no shoes upstairs", "strip the beds before you leave", as tidied markdown. Null if they said nothing of the kind.',
    ),
    suggestedHowTo: FIELD_SCHEMA(
      'The parts that explain how to operate the place, e.g. "the water shut-off is by the road", "the gate code is 4417", as tidied markdown. Null if they said nothing of the kind.',
    ),
    suggestedContacts: {
      type: "array",
      // Same finding as the note intent: `maxItems` on an array is rejected by
      // structured outputs with a 400. Capped for real in the parser.
      description: `People or companies they named AND gave a phone number or an email address for. Do not include someone merely mentioned with no way to reach them. An empty array if nobody reachable was named. At most ${MAX_SUGGESTED_CONTACTS}.`,
      items: {
        type: "object",
        properties: {
          label: {
            type: ["string", "null"],
            description:
              'What they do, in two or three words: "Plumber", "Snow removal", "Caretaker".',
          },
          name: {
            type: ["string", "null"],
            description: "Their name or company, as said.",
          },
          phone: {
            type: ["string", "null"],
            description:
              'Their phone number, digits only as spoken, e.g. "five five five one two three four" becomes "5551234". Null if they did not give one.',
          },
          email: {
            type: ["string", "null"],
            description: "Their email address, or null.",
          },
          notes: {
            type: ["string", "null"],
            description:
              "Anything else said about them, in one short line.",
          },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
            description:
              "How sure you are of this whole suggestion. Use low for anything you had to guess at.",
          },
        },
        required: ["label", "name", "phone", "email", "notes", "confidence"],
        additionalProperties: false,
      },
    },
    suggestedReminders: {
      type: "array",
      description: `Things they asked to be reminded about on a specific day. An empty array if they named no day at all. At most ${MAX_SUGGESTED_REMINDERS}.`,
      items: {
        type: "object",
        properties: {
          title: {
            type: ["string", "null"],
            description:
              'What it is, in two or three words a family would recognise: "Propane bill", "Gutter cleaning".',
          },
          spokenAs: {
            type: ["string", "null"],
            description:
              'The words they actually used for the day, quoted: "the fifteenth", "next Friday", "the end of the month". This is shown to them next to the date you worked out, so they can check your arithmetic. Never paraphrase it.',
          },
          dueDate: {
            type: ["string", "null"],
            description:
              "That day as YYYY-MM-DD, worked out from today's date given in the instructions. Null if they named no day.",
          },
          amount: {
            type: ["string", "null"],
            description:
              'An amount of money, if they said one, e.g. "$412.30". Null otherwise.',
          },
          notes: {
            type: ["string", "null"],
            description:
              "Any other detail they gave about it, in one short plain-text line.",
          },
          recurrence: {
            type: "string",
            enum: RECURRENCE_VALUES,
            description:
              'How often it repeats, but ONLY if they said so — "every month", "every year". If they did not say, answer "none".',
          },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
            description:
              'How sure you are of the date specifically. Use "high" only when they named an unambiguous day. Anything you worked out from a relative phrase is at most "medium".',
          },
        },
        required: [
          "title",
          "spokenAs",
          "dueDate",
          "amount",
          "notes",
          "recurrence",
          "confidence",
        ],
        additionalProperties: false,
      },
    },
  },
  required: [
    "transcription",
    "suggestedGuidelines",
    "suggestedHowTo",
    "suggestedContacts",
    "suggestedReminders",
  ],
  additionalProperties: false,
} as const;

/**
 * Built per call, because resolving "the fifteenth" needs to know what today is.
 *
 * That date is the one place this intent is allowed to produce something the
 * speaker didn't literally say, and it is bounded on both sides: the model must
 * quote the words it resolved (`spokenAs`), the member sees the quote next to the
 * resolved date, and the reminder still saves through the ordinary gated action.
 * Everything else keeps the note intent's hard rule — no phone number, no name,
 * no instruction that wasn't spoken.
 */
export function dictationPrompt(todayIso: string): string {
  return `Someone has spoken into their phone about their family's holiday property, and the phone has turned their speech into text. It is one long run-on: no punctuation, filler words, false starts, and topics that jump around. They are not a fast typist, which is why they spoke.

Today's date is ${todayIso}.

Tidy what they said, then sort it into the places it belongs. Rules:

- Tidy, do not rewrite. Punctuate, paragraph, and drop filler ("um", "you know", "let me think"). Keep their vocabulary, their facts, their numbers, and their order. Do not add advice, headings they did not imply, or detail they did not give.
- Where they corrected themselves, keep what they settled on and drop the false start. "The code is four four one seven, no wait, four four seven one" is 4471.
- Speech-to-text mangles numbers and names. If a phone number came through with too few digits, or a name is clearly garbled, leave it out rather than repairing it. A number you patched is worse than a number they retype.
- Never invent a phone number, an email address, or a name. Only offer someone as a contact if they gave a way to reach that person.
- Only propose a reminder if they named a day. "Soon", "at some point", and "before winter" are not days. If they named no day, return an empty list. That is a correct answer.
- When they named a day in relative words, work out the real date from today's date above, and quote their exact words in "spokenAs" so they can check it.
- "Guidelines" is what people staying are asked to do; "how to" is how the building works. A line belongs in one of them, not both. Leave a section null when they simply did not cover it.
- The tidied text goes in "transcription" in full, even where parts of it also appear in a section below. That is their record of what they said.
- Do not answer them, comment on what they said, or return anything outside the schema.`;
}

// --- Validation ------------------------------------------------------------

const MAX_FIELD_CHARS = 500;
const MAX_RAW_TEXT_CHARS = 4000;

/** Prose fields (a transcription, a block of guidelines) need far more room
 * than a phone number, so the cap is per-call rather than global. */
const MAX_PROSE_CHARS = 4000;

function readField(raw: unknown, maxChars = MAX_FIELD_CHARS): ExtractedField {
  if (!raw || typeof raw !== "object") {
    return { value: null, confidence: "low" };
  }
  const record = raw as Record<string, unknown>;
  const value = readString(record.value, maxChars);
  const confidence = readConfidence(record.confidence);
  return { value, confidence };
}

function readString(raw: unknown, maxChars: number): string | null {
  return typeof raw === "string" && raw.trim().length > 0
    ? raw.trim().slice(0, maxChars)
    : null;
}

function readConfidence(raw: unknown): FieldConfidence {
  return raw === "high" || raw === "medium" ? raw : "low";
}

/**
 * Coerce whatever came back into the exact shape the review form expects.
 *
 * Structured outputs make a malformed response unlikely, but this is the only
 * place model output crosses into our UI, so it validates rather than trusts:
 * unknown keys are dropped (nothing outside CONTACT_FIELD_KEYS can be proposed,
 * so no privileged property column is reachable), strings are trimmed and
 * capped, and a missing field degrades to an empty low-confidence one.
 */
export function parseContactExtraction(raw: unknown): ContactExtraction {
  const record = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const rawFields = (
    record.fields && typeof record.fields === "object" ? record.fields : {}
  ) as Record<string, unknown>;

  const fields = Object.fromEntries(
    CONTACT_FIELD_KEYS.map((key) => [key, readField(rawFields[key])]),
  ) as Record<ContactFieldKey, ExtractedField>;

  const rawText =
    typeof record.rawText === "string"
      ? record.rawText.slice(0, MAX_RAW_TEXT_CHARS)
      : "";

  return { fields, rawText };
}

/**
 * The note-intent counterpart. Same posture as `parseContactExtraction`: this is
 * the only place model output crosses into our UI, so it validates rather than
 * trusts. Unknown keys are dropped, which is what keeps the privileged property
 * columns (status / max_guests / peak / hero) unreachable from a document — the
 * shape below is the complete set of things a note can ever propose.
 */
export function parseNoteExtraction(raw: unknown): NoteExtraction {
  const record = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;

  const rawContacts = Array.isArray(record.suggestedContacts)
    ? record.suggestedContacts.slice(0, MAX_SUGGESTED_CONTACTS)
    : [];

  const suggestedContacts = rawContacts
    .map((entry): SuggestedContact => {
      const c = (entry && typeof entry === "object" ? entry : {}) as Record<
        string,
        unknown
      >;
      return {
        label: readString(c.label, MAX_FIELD_CHARS),
        name: readString(c.name, MAX_FIELD_CHARS),
        phone: readString(c.phone, MAX_FIELD_CHARS),
        email: readString(c.email, MAX_FIELD_CHARS),
        notes: readString(c.notes, MAX_FIELD_CHARS),
        confidence: readConfidence(c.confidence),
      };
    })
    // Enforced here as well as asked for in the schema, because the prompt is a
    // request and this is a guarantee. A "contact" with no phone and no email is
    // a name we misread off a page, offered to a member as though it were a
    // record worth keeping.
    .filter((c) => c.phone || c.email);

  return {
    transcription: readField(record.transcription, MAX_PROSE_CHARS),
    suggestedGuidelines: readField(record.suggestedGuidelines, MAX_PROSE_CHARS),
    suggestedHowTo: readField(record.suggestedHowTo, MAX_PROSE_CHARS),
    suggestedContacts,
  };
}

/**
 * The dictation counterpart, assembled from the two parsers either side of it
 * rather than rewritten.
 *
 * That reuse is the point: the guarantees that matter here — unknown keys
 * dropped so no privileged property column is reachable, a contact without a
 * phone or an email discarded, a reminder whose date isn't a real calendar day
 * discarded — are the *same* guarantees, and a second copy of them is a second
 * place for them to drift. The only thing added is `spokenAs`, which the
 * calendar parser has no reason to carry.
 */
export function parseDictationExtraction(raw: unknown): DictationExtraction {
  const record = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;

  const note = parseNoteExtraction(record);

  // `parseCalendarExtraction` reads `reminders`; this intent's key is
  // `suggestedReminders`, so hand it the array under the name it expects.
  const { reminders } = parseCalendarExtraction({
    reminders: record.suggestedReminders,
  });

  const spoken = Array.isArray(record.suggestedReminders)
    ? record.suggestedReminders
    : [];
  // Consumed as they match, so two reminders landing on the same day take their
  // own quoted phrase rather than both showing the first one's. The calendar
  // parser preserves order and only ever drops entries, so walking to the first
  // unused match is an exact pairing.
  const claimed = new Set<number>();

  return {
    // Re-read with the roomier cap: a tidied dictation is prose, and truncating
    // the end of what somebody said is a silent loss of their work.
    transcription: readField(record.transcription, MAX_DICTATION_PROSE_CHARS),
    suggestedGuidelines: note.suggestedGuidelines,
    suggestedHowTo: note.suggestedHowTo,
    suggestedContacts: note.suggestedContacts,
    suggestedReminders: reminders.map((reminder) => ({
      ...reminder,
      // Matched by date rather than by position, because the calendar parser
      // drops undated entries and the two arrays are not index-aligned.
      spokenAs: claimSpokenAs(spoken, claimed, reminder.dueDate),
    })),
  };
}

function claimSpokenAs(
  entries: unknown[],
  claimed: Set<number>,
  dueDate: string,
): string | null {
  for (let i = 0; i < entries.length; i++) {
    if (claimed.has(i)) continue;
    const entry = entries[i];
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    if (readString(r.dueDate, 10) === dueDate) {
      claimed.add(i);
      return readString(r.spokenAs, MAX_FIELD_CHARS);
    }
  }
  return null;
}

/**
 * The calendar-intent counterpart. Same posture again: validate, don't trust.
 *
 * The date check is the substance of this one. `parseYmd` rejects anything that
 * isn't a real calendar day, which catches both the obvious garbage ("next
 * Tuesday", "03/15") and the plausible garbage that matters more — "2027-02-30",
 * a well-formed string naming a day that doesn't exist. A suggestion that fails
 * it is dropped rather than offered with an empty date box, because a reminder
 * with no date is not a reminder, and half-filling the form would present a
 * failed read as a successful one.
 */
export function parseCalendarExtraction(raw: unknown): CalendarExtraction {
  const record = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;

  const rawReminders = Array.isArray(record.reminders)
    ? record.reminders.slice(0, MAX_SUGGESTED_REMINDERS)
    : [];

  const reminders = rawReminders
    .map((entry): SuggestedReminder | null => {
      const r = (entry && typeof entry === "object" ? entry : {}) as Record<
        string,
        unknown
      >;
      const dueDate = readString(r.dueDate, 10);
      if (!dueDate || !parseYmd(dueDate)) return null;

      const recurrence: ReminderRecurrence = isReminderRecurrence(r.recurrence)
        ? r.recurrence
        : "none";

      return {
        title: readString(r.title, MAX_FIELD_CHARS),
        dueDate,
        amount: readString(r.amount, MAX_FIELD_CHARS),
        notes: readString(r.notes, MAX_FIELD_CHARS),
        recurrence,
        confidence: readConfidence(r.confidence),
      };
    })
    .filter((r): r is SuggestedReminder => r !== null);

  const rawText =
    typeof record.rawText === "string"
      ? record.rawText.slice(0, MAX_RAW_TEXT_CHARS)
      : "";

  return { reminders, rawText };
}
