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

export type IntakeIntent = "contact" | "note";

export const INTAKE_INTENTS: IntakeIntent[] = ["contact", "note"];

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
