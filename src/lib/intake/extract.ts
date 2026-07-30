// Smart Intake — the vision call (PRD 32).
//
// SERVER ONLY. This module reads ANTHROPIC_API_KEY and must never be imported
// from a Client Component. Its only caller is the `extractIntake` Server Action
// in the property edit route, which does the auth gating.
//
// This wrapper reads a document and returns structured fields. It performs no
// database writes of any kind — extraction is a typing aid, and every value it
// produces is an *initial form value* that a member confirms through the
// existing gated Server Actions (PRD 27).

import Anthropic from "@anthropic-ai/sdk";

import {
  CONTACT_EXTRACTION_JSON_SCHEMA,
  CONTACT_EXTRACTION_PROMPT,
  NOTE_EXTRACTION_JSON_SCHEMA,
  NOTE_EXTRACTION_PROMPT,
  isAllowedIntakeMime,
  parseContactExtraction,
  parseNoteExtraction,
  type ContactExtraction,
  type IntakeIntent,
  type NoteExtraction,
} from "@/lib/intake/schema";

/**
 * The intent registry: prompt, schema, and validator per target. Adding slice
 * 3's calendar intent should be one more entry here plus a review form, not a
 * new code path.
 */
const INTENTS = {
  contact: {
    prompt: CONTACT_EXTRACTION_PROMPT,
    schema: CONTACT_EXTRACTION_JSON_SCHEMA,
    parse: parseContactExtraction,
  },
  note: {
    prompt: NOTE_EXTRACTION_PROMPT,
    schema: NOTE_EXTRACTION_JSON_SCHEMA,
    parse: parseNoteExtraction,
  },
} as const satisfies Record<
  IntakeIntent,
  { prompt: string; schema: object; parse: (raw: unknown) => unknown }
>;

/**
 * Chosen by eval, not by tier instinct — see `evals/intake/`. Across 96
 * extractions over six documents and four degradation levels, Haiku matched
 * Sonnet on accuracy at realistic photo quality (68% correct, 29% correct
 * restraint each), fabricated slightly less, and neither model ever invented a
 * phone number or email on a document that had none. Past realistic quality
 * Sonnet fabricated *more*, and fabricated plausibly ("415 Loon Lake Road"
 * against a true 418), which is the shape that survives a human skim.
 *
 * At roughly a quarter of the cost and faster, this is the better default for a
 * feature whose whole point is that Dad uploads a stack of documents.
 *
 * Override with INTAKE_MODEL to try another tier without a code change. Re-run
 * the eval before changing this permanently — the handwriting evidence rests on
 * a single document, which is the thinnest part of that corpus.
 */
const DEFAULT_MODEL = "claude-haiku-4-5";

// Per-million-token rates, used only to log an estimated spend — enough to
// answer "is this costing us cents or dollars?" without a billing dashboard
// round-trip. Keyed by model so the log doesn't silently misreport when
// INTAKE_MODEL points somewhere else; an unknown model falls back to the
// priciest entry so the estimate errs high rather than low.
//
// Sonnet 5 is listed at its steady-state rate. Its introductory pricing
// ($2/$10) runs through 2026-08-31.
const MODEL_RATES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-opus-5": { input: 5, output: 25 },
};

function ratesFor(model: string): { input: number; output: number } {
  return (
    MODEL_RATES[model] ??
    Object.values(MODEL_RATES).reduce((a, b) => (b.output > a.output ? b : a))
  );
}

export type ExtractionUsage = {
  inputTokens: number;
  outputTokens: number;
  /** Estimated USD for this single extraction. */
  estimatedCostUsd: number;
};

/** What each intent hands back, so callers get a typed result per intent. */
export type ExtractionByIntent = {
  contact: ContactExtraction;
  note: NoteExtraction;
};

/**
 * Distributed over the intent so that a caller holding an unnarrowed
 * `ExtractionResult` gets a proper discriminated union: checking `intent`
 * narrows `extraction` to that intent's shape.
 */
type ExtractionSuccess<I extends IntakeIntent> = I extends IntakeIntent
  ? {
      ok: true;
      intent: I;
      extraction: ExtractionByIntent[I];
      usage: ExtractionUsage;
    }
  : never;

export type ExtractionResult<I extends IntakeIntent = IntakeIntent> =
  | ExtractionSuccess<I>
  | { ok: false; message: string };

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  cachedClient ??= new Anthropic({ apiKey });
  return cachedClient;
}

/**
 * The `effort` knob exists on the Opus 4.5+ / Sonnet 4.6+ tiers but not on
 * Haiku, which rejects the request outright rather than ignoring the field.
 * Kept as a denylist so an unrecognised newer model gets effort by default.
 */
function supportsEffort(model: string): boolean {
  return !/haiku|sonnet-4-5/.test(model);
}

/** Whether the feature is configured at all. Drives the UI's entry point. */
export function isIntakeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Read a document and return pre-fill values for the given intent.
 *
 * One call per upload — no retry loop. A bad read is a two-second edit in the
 * review form, which is cheaper (and more honest) than silently paying for a
 * second opinion the member never asked for.
 */
export async function extractFromDocument<I extends IntakeIntent>(opts: {
  bytes: Uint8Array;
  contentType: string;
  intent: I;
}): Promise<ExtractionResult<I>> {
  const client = getClient();
  if (!client) {
    return {
      ok: false,
      message:
        "Reading documents isn't set up yet. An admin needs to add the ANTHROPIC_API_KEY setting.",
    };
  }

  const contentType = opts.contentType.toLowerCase();
  if (!isAllowedIntakeMime(contentType)) {
    return {
      ok: false,
      message: `We can't read ${contentType} files. Try a JPG, PNG, or PDF.`,
    };
  }

  const model = process.env.INTAKE_MODEL ?? DEFAULT_MODEL;
  const intent = INTENTS[opts.intent];
  const data = Buffer.from(opts.bytes).toString("base64");

  // PDFs travel as a document block, images as an image block. Both go before
  // the instruction text so the model reads the page first.
  const source =
    contentType === "application/pdf"
      ? ({
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data,
          },
        })
      : ({
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: contentType as
              | "image/jpeg"
              | "image/png"
              | "image/webp"
              | "image/gif",
            data,
          },
        });

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 4000,
      output_config: {
        // Low effort is right for transcription: the work is reading what's on
        // the page, not reasoning about it, and it keeps latency in the range
        // where "reading your document…" stays a short wait.
        //
        // Not every model accepts `effort` — Haiku rejects the whole request
        // with a 400 — so it's omitted rather than hardcoded. Without this,
        // pointing INTAKE_MODEL at a cheaper model fails outright.
        ...(supportsEffort(model) ? { effort: "low" as const } : {}),
        format: {
          type: "json_schema",
          schema: intent.schema,
        },
      },
      messages: [
        {
          role: "user",
          content: [source, { type: "text", text: intent.prompt }],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return {
        ok: false,
        message:
          "We couldn't read that document. Try a clearer photo, or add the details by hand.",
      };
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return {
        ok: false,
        message:
          "We couldn't read that document. Try a clearer photo, or add the details by hand.",
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      return {
        ok: false,
        message:
          "We couldn't make sense of that document. Try a clearer photo, or add the details by hand.",
      };
    }

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const rates = ratesFor(model);
    const estimatedCostUsd =
      (inputTokens / 1_000_000) * rates.input +
      (outputTokens / 1_000_000) * rates.output;

    // Spend watch (PRD 32 guardrail). Tokens and cost only — never the
    // document, the extracted values, or the key.
    console.info(
      `[intake] ${opts.intent} extraction complete: ${inputTokens} in / ${outputTokens} out tokens, ~$${estimatedCostUsd.toFixed(4)}`,
    );

    // The registry pairs each intent's schema with the validator that returns
    // that intent's shape, so this is sound; TypeScript can't follow the
    // pairing through the indexed lookup, hence the one assertion.
    return {
      ok: true,
      intent: opts.intent,
      extraction: intent.parse(parsed),
      usage: { inputTokens, outputTokens, estimatedCostUsd },
    } as ExtractionResult<I>;
  } catch (error) {
    // Deliberately vague to the member, specific in the server log. An SDK
    // error can carry request context we don't want on a family member's
    // screen, and never the key.
    console.error("[intake] extraction failed", error);
    return {
      ok: false,
      message:
        "Something went wrong while reading that document. Please try again in a moment.",
    };
  }
}
