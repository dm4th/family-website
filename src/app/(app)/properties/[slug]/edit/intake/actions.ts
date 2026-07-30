"use server";

import { createClient } from "@/lib/supabase/server";
import { resolveViewer } from "@/lib/guest";
import { extractFromDocument } from "@/lib/intake/extract";
import {
  INTAKE_BUCKET,
  MAX_INTAKE_BYTES,
  isAllowedIntakeMime,
  isIntakeIntent,
  isValidIntakePath,
  type ContactExtraction,
  type IntakeIntent,
  type NoteExtraction,
} from "@/lib/intake/schema";

/**
 * How long the "open the original" link stays good. Long enough to sit with a
 * hard-to-read note and compare it line by line, short enough that a copied URL
 * isn't a lasting hole in a private bucket holding account numbers.
 */
const SOURCE_URL_TTL_SECONDS = 60 * 30;

export type ExtractIntakeState =
  | {
      status: "ok";
      intent: "contact";
      extraction: ContactExtraction;
      sourceUrl: string | null;
    }
  | {
      status: "ok";
      intent: "note";
      extraction: NoteExtraction;
      sourceUrl: string | null;
    }
  | { status: "error"; message: string };

/**
 * Read an uploaded document and return pre-fill values. **This never writes
 * anything the member has to live with.**
 *
 * The only row it creates is the `intake_documents` provenance record for the
 * file that was uploaded — no contact, no property change, no revision. Saving
 * happens afterwards through `addPropertyContact` / `updateProperty`, unchanged,
 * with their existing gating and `recordRevision` audit trail (PRD 27).
 *
 * Guests are rejected here as well as at the entry point: the page not linking
 * to intake is a UX nicety, this is the actual boundary.
 */
export async function extractIntake(
  propertyId: string,
  storagePath: string,
  intent: IntakeIntent,
): Promise<ExtractIntakeState> {
  if (!isIntakeIntent(intent)) {
    return { status: "error", message: "We don't know how to read that." };
  }

  const viewer = await resolveViewer();
  if (!viewer) {
    return { status: "error", message: "Please sign in and try again." };
  }
  if (viewer.isGuest) {
    return {
      status: "error",
      message: "Guests can't add property details.",
    };
  }

  if (!isValidIntakePath(storagePath)) {
    return { status: "error", message: "That file couldn't be found." };
  }

  const supabase = await createClient();

  // Confirm the property is one this member can actually read. RLS would catch
  // it anyway, but a clean message beats a confusing empty result.
  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .maybeSingle();
  if (!property) {
    return { status: "error", message: "That property couldn't be found." };
  }

  const { data: file, error: downloadError } = await supabase.storage
    .from(INTAKE_BUCKET)
    .download(storagePath);
  if (downloadError || !file) {
    return {
      status: "error",
      message: "We couldn't open that upload. Please try uploading it again.",
    };
  }

  if (file.size > MAX_INTAKE_BYTES) {
    return {
      status: "error",
      message: `That file is larger than ${Math.round(MAX_INTAKE_BYTES / 1024 / 1024)}MB.`,
    };
  }

  // Trust the stored object's own type, not anything the client told us.
  const contentType = (file.type || "").toLowerCase();
  if (!isAllowedIntakeMime(contentType)) {
    return {
      status: "error",
      message: "We can only read photos (JPG, PNG) and PDFs.",
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await extractFromDocument({ bytes, contentType, intent });
  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  // Provenance: record that this document was read for this property, so the
  // original can be re-opened if a pre-filled field looks wrong. Written after
  // a successful read and best-effort — a failure here costs us the audit line,
  // not the member's work.
  const { error: recordError } = await supabase.from("intake_documents").insert({
    property_id: propertyId,
    storage_path: storagePath,
    content_type: contentType,
    byte_size: file.size,
    intent,
    uploaded_by: viewer.userId,
  });
  if (recordError) {
    console.error("[intake] could not record source document", recordError);
  }

  // A short-lived link back to the photo, so a member checking a hard-to-read
  // transcription can hold it against the original. Signed, never public, and
  // best-effort: losing it costs a convenience, not the extraction.
  const { data: signed } = await supabase.storage
    .from(INTAKE_BUCKET)
    .createSignedUrl(storagePath, SOURCE_URL_TTL_SECONDS);
  const sourceUrl = signed?.signedUrl ?? null;

  // Narrowed by intent so each caller gets the extraction type it expects.
  return result.intent === "note"
    ? { status: "ok", intent: "note", extraction: result.extraction, sourceUrl }
    : {
        status: "ok",
        intent: "contact",
        extraction: result.extraction,
        sourceUrl,
      };
}
