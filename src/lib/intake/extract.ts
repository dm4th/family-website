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
  isAllowedIntakeMime,
  parseContactExtraction,
  type ContactExtraction,
} from "@/lib/intake/schema";

/**
 * Sonnet-class vision, per the PRD's pre-flight decision: it reads photographed
 * bills and handwriting well at a few tenths of a cent per document, which
 * matters when the whole point is that Dad uploads a stack of them. Override
 * with INTAKE_MODEL to try a different tier without a code change.
 */
const DEFAULT_MODEL = "claude-sonnet-5";

// Per-million-token rates for the default model, used only to log an estimated
// spend. Wrong-but-close is fine here; it exists to answer "is this costing us
// cents or dollars?" without a billing dashboard round-trip.
//
// These are Sonnet 5's steady-state rates. Introductory pricing ($2/$10) runs
// through 2026-08-31, so the logged figure currently overstates the real bill
// by about a third. Deliberately the conservative direction. If INTAKE_MODEL
// points somewhere else, the log is an over-estimate for cheaper models.
const INPUT_COST_PER_MTOK = 3;
const OUTPUT_COST_PER_MTOK = 15;

export type ExtractionUsage = {
  inputTokens: number;
  outputTokens: number;
  /** Estimated USD for this single extraction. */
  estimatedCostUsd: number;
};

export type ExtractionResult =
  | { ok: true; extraction: ContactExtraction; usage: ExtractionUsage }
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
 * Read a bill/statement/note and return vendor contact fields.
 *
 * One call per upload — no retry loop. A bad read is a two-second edit in the
 * review form, which is cheaper (and more honest) than silently paying for a
 * second opinion the member never asked for.
 */
export async function extractContactFromDocument(opts: {
  bytes: Uint8Array;
  contentType: string;
}): Promise<ExtractionResult> {
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
          schema: CONTACT_EXTRACTION_JSON_SCHEMA,
        },
      },
      messages: [
        {
          role: "user",
          content: [source, { type: "text", text: CONTACT_EXTRACTION_PROMPT }],
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
    const estimatedCostUsd =
      (inputTokens / 1_000_000) * INPUT_COST_PER_MTOK +
      (outputTokens / 1_000_000) * OUTPUT_COST_PER_MTOK;

    // Spend watch (PRD 32 guardrail). Tokens and cost only — never the
    // document, the extracted values, or the key.
    console.info(
      `[intake] extraction complete: ${inputTokens} in / ${outputTokens} out tokens, ~$${estimatedCostUsd.toFixed(4)}`,
    );

    return {
      ok: true,
      extraction: parseContactExtraction(parsed),
      usage: { inputTokens, outputTokens, estimatedCostUsd },
    };
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
