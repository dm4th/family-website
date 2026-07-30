// Smart Intake extraction schemas (PRD 32).
//
// Browser-safe: no server-only imports, so the upload picker and the review
// form can share the size cap, the accepted file types, and the shape of what
// the model gives back.
//
// One schema per intent. Slice 1 ships "contact" (a vendor off a bill, plus the
// service address when one is clearly present). Slices 2 and 3 add "note" and
// "calendar" here — the pipeline around this file is deliberately intent-driven
// so they only add a schema and a review form, not a new path.

export type IntakeIntent = "contact";

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

// --- Validation ------------------------------------------------------------

const MAX_FIELD_CHARS = 500;
const MAX_RAW_TEXT_CHARS = 4000;

function readField(raw: unknown): ExtractedField {
  if (!raw || typeof raw !== "object") {
    return { value: null, confidence: "low" };
  }
  const record = raw as Record<string, unknown>;
  const rawValue = record.value;
  const value =
    typeof rawValue === "string" && rawValue.trim().length > 0
      ? rawValue.trim().slice(0, MAX_FIELD_CHARS)
      : null;
  const confidence =
    record.confidence === "high" || record.confidence === "medium"
      ? record.confidence
      : "low";
  return { value, confidence };
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
