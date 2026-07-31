"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { resolveViewer } from "@/lib/guest";
import { extractFromDictation, extractFromDocument } from "@/lib/intake/extract";
import {
  INTAKE_BUCKET,
  MAX_DICTATION_CHARS,
  MAX_INTAKE_BYTES,
  generateIntakeTextPath,
  isAllowedIntakeMime,
  isDocumentIntent,
  isValidIntakePath,
  type CalendarExtraction,
  type ContactExtraction,
  type DictationExtraction,
  type DocumentIntent,
  type NoteExtraction,
} from "@/lib/intake/schema";

/**
 * How long the "open the original" link stays good. Long enough to sit with a
 * hard-to-read note and compare it line by line, short enough that a copied URL
 * isn't a lasting hole in a private bucket holding account numbers.
 */
const SOURCE_URL_TTL_SECONDS = 60 * 30;

/**
 * The property columns the intake forms carry through a partial `updateProperty`
 * submit. Mirrors `IntakeProperty` in `property-carry-fields.tsx`.
 */
const CARRY_COLUMNS =
  "id, slug, name, location, address, description, how_to, guidelines, amenities, status, max_guests";

export type IntakePropertySnapshot = {
  id: string;
  slug: string;
  name: string;
  location: string | null;
  address: string | null;
  description: string | null;
  how_to: string | null;
  guidelines: string | null;
  amenities: string[];
  status: string;
  max_guests: number | null;
};

/**
 * Re-read the property after a save. Read-only; writes nothing.
 *
 * This exists because `updateProperty` is a whole-form action and a review
 * session can hold more than one form pointed at it — a note that fills both
 * guidelines and how-to renders two. Each form carries the fields it isn't
 * editing as hidden inputs, so without this the second save would carry the
 * values from page load and quietly revert the first save, with a "Saved"
 * confirmation on screen for both.
 *
 * Refetching rather than having each form report what it wrote is the safer
 * shape: a form added later can't reintroduce the bug by forgetting to
 * report a field, because the server is the one being asked.
 */
export async function refreshIntakeProperty(
  propertyId: string,
): Promise<IntakePropertySnapshot | null> {
  const viewer = await resolveViewer();
  if (!viewer || viewer.isGuest) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .select(CARRY_COLUMNS)
    .eq("id", propertyId)
    .maybeSingle();
  if (error || !data) return null;

  return { ...data, amenities: data.amenities ?? [] } as IntakePropertySnapshot;
}

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
  | {
      status: "ok";
      intent: "calendar";
      extraction: CalendarExtraction;
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
  intent: DocumentIntent,
): Promise<ExtractIntakeState> {
  // Document intents only. `dictation` reads text, not an uploaded file, and
  // has its own action below — routing it through here would hand the vision
  // path a `.txt` and fail on the MIME check with a confusing message.
  if (!isDocumentIntent(intent)) {
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
  //
  // Upsert rather than insert, because slice 3 lets a member read one upload a
  // second way ("also check this bill for a due date") and `storage_path` is
  // unique. The row records that this document was read for this property, which
  // stays true; it keeps the intent of the first read rather than growing a row
  // per pass.
  const { error: recordError } = await supabase
    .from("intake_documents")
    .upsert(
      {
        property_id: propertyId,
        storage_path: storagePath,
        content_type: contentType,
        byte_size: file.size,
        intent,
        uploaded_by: viewer.userId,
      },
      { onConflict: "storage_path", ignoreDuplicates: true },
    );
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
  switch (result.intent) {
    case "note":
      return {
        status: "ok",
        intent: "note",
        extraction: result.extraction,
        sourceUrl,
      };
    case "calendar":
      return {
        status: "ok",
        intent: "calendar",
        extraction: result.extraction,
        sourceUrl,
      };
    default:
      return {
        status: "ok",
        intent: "contact",
        extraction: result.extraction,
        sourceUrl,
      };
  }
}

// --- Dictation: speaking instead of typing (PRD 34) ------------------------

export type ExtractDictationState =
  | {
      status: "ok";
      extraction: DictationExtraction;
      sourceUrl: string | null;
    }
  | { status: "error"; message: string };

/**
 * Tidy a spoken session into proposals. **Writes nothing the member has to live
 * with**, exactly like `extractIntake`.
 *
 * The one thing it stores is the raw transcript, as a `.txt` in the same private
 * bucket the photos go to, with the same provenance row. That is what makes the
 * retention promise hold for voice: a member who wants to check what was filled
 * in against what they actually said can open it, and PRD 33's delete path
 * removes it with no knowledge that it isn't an image.
 *
 * Stored *before* the model call, not after. The transcript is the member's own
 * words, and it is the thing worth keeping even when the tidy-up fails —
 * storing it afterwards would lose it in exactly the case they most need it.
 */
export async function extractDictation(
  propertyId: string,
  text: string,
): Promise<ExtractDictationState> {
  const viewer = await resolveViewer();
  if (!viewer) {
    return { status: "error", message: "Please sign in and try again." };
  }
  if (viewer.isGuest) {
    return { status: "error", message: "Guests can't add property details." };
  }

  const transcript = text.trim();
  if (!transcript) {
    return {
      status: "error",
      message: "There's nothing here yet. Say or type something first.",
    };
  }
  if (transcript.length > MAX_DICTATION_CHARS) {
    return {
      status: "error",
      message:
        "That's more than we can take in one go. Save what you have in a few shorter goes instead.",
    };
  }

  const supabase = await createClient();

  const { data: property } = await supabase
    .from("properties")
    .select("id, slug")
    .eq("id", propertyId)
    .maybeSingle<{ id: string; slug: string }>();
  if (!property) {
    return { status: "error", message: "That property couldn't be found." };
  }

  const body = new Blob([transcript], { type: "text/plain" });
  const storagePath = generateIntakeTextPath();
  const { error: uploadError } = await supabase.storage
    .from(INTAKE_BUCKET)
    .upload(storagePath, body, { contentType: "text/plain", upsert: false });

  // Uploaded from the server rather than the browser, unlike the photo path.
  // Text this size is nowhere near the Server Action body limit that forced
  // photos to go direct, and doing it here means the transcript and the row
  // that indexes it are written by the same caller.
  if (uploadError) {
    console.error("[intake] could not store dictation transcript", uploadError);
    return {
      status: "error",
      message: "We couldn't save what you said. Please try again.",
    };
  }

  const { error: recordError } = await supabase.from("intake_documents").insert({
    property_id: propertyId,
    storage_path: storagePath,
    content_type: "text/plain",
    byte_size: body.size,
    intent: "dictation",
    uploaded_by: viewer.userId,
  });
  if (recordError) {
    // The object is stored but unindexed, which is the orphan PRD 33 exists to
    // prevent — so take it back out rather than leave something in the bucket
    // that no panel can show and no member can delete.
    console.error("[intake] could not record dictation", recordError);
    await supabase.storage.from(INTAKE_BUCKET).remove([storagePath]);
    return {
      status: "error",
      message: "We couldn't save what you said. Please try again.",
    };
  }

  const result = await extractFromDictation({ text: transcript });
  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  const { data: signed } = await supabase.storage
    .from(INTAKE_BUCKET)
    .createSignedUrl(storagePath, SOURCE_URL_TTL_SECONDS);

  revalidatePath(`/properties/${property.slug}/edit/intake`);

  return {
    status: "ok",
    extraction: result.extraction,
    sourceUrl: signed?.signedUrl ?? null,
  };
}

// --- Retention: seeing and removing what's been read (PRD 33) --------------

type DocumentRecord = {
  storage_path: string;
  uploaded_by: string;
  properties: { slug: string } | null;
};

/**
 * Load one provenance row and decide whether this viewer may remove it.
 *
 * Authorization is uploader-or-admin, the same rule as the `intake_documents`
 * delete policy and (after this PRD's migration) the bucket's. RLS enforces it
 * regardless; checking here is what turns a silent no-op into a message.
 */
async function loadDocumentFor(
  documentId: string,
  need: "read" | "delete",
): Promise<
  | { ok: true; row: DocumentRecord; slug: string | null }
  | { ok: false; message: string }
> {
  const viewer = await resolveViewer();
  if (!viewer) return { ok: false, message: "Please sign in and try again." };
  if (viewer.isGuest) {
    return { ok: false, message: "Guests can't open property documents." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("intake_documents")
    .select("storage_path, uploaded_by, properties(slug)")
    .eq("id", documentId)
    .maybeSingle<DocumentRecord>();
  if (error || !data) {
    return { ok: false, message: "That document couldn't be found." };
  }

  if (need === "delete" && !viewer.isAdmin && viewer.userId !== data.uploaded_by) {
    return {
      ok: false,
      message: "Only the person who added this, or an admin, can remove it.",
    };
  }

  return { ok: true, row: data, slug: data.properties?.slug ?? null };
}

export type IntakeDocumentUrlState =
  | { status: "ok"; url: string }
  | { status: "error"; message: string };

/**
 * A fresh short-lived link to one stored document.
 *
 * Minted on request rather than when the list is drawn, so opening a bill is a
 * deliberate act with its own clock. Drawing the panel hands out nothing.
 */
export async function intakeDocumentUrl(
  documentId: string,
): Promise<IntakeDocumentUrlState> {
  const found = await loadDocumentFor(documentId, "read");
  if (!found.ok) return { status: "error", message: found.message };

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(INTAKE_BUCKET)
    .createSignedUrl(found.row.storage_path, SOURCE_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    return {
      status: "error",
      message: "We couldn't open that document. It may have been removed.",
    };
  }
  return { status: "ok", url: data.signedUrl };
}

/**
 * Remove a document: the stored original first, then the row that records it.
 *
 * Object first, deliberately. If the storage delete fails the row stays, so the
 * member sees a document that is still there and can try again. Row first would
 * leave an object nobody can see, name, or reach — which is precisely the debris
 * the PRD-32 walks left behind and had to be cleaned out by hand.
 *
 * An already-missing object is not a failure: those orphans exist today, and the
 * point of this action is that they can finally be tidied from the app. But
 * "missing" is established by listing the folder *before* removing, not inferred
 * from an empty remove result, because a permission failure looks identical to a
 * missing file in that response and must not be allowed to drop the row anyway.
 *
 * No `recordRevision`. These rows are provenance about member content, not the
 * content itself, and deleting one shouldn't push a family member's edits down
 * the history page. The server log keeps the trace.
 */
export async function deleteIntakeDocument(documentId: string): Promise<void> {
  const found = await loadDocumentFor(documentId, "delete");
  if (!found.ok) throw new Error(found.message);

  const path = found.row.storage_path;
  const supabase = await createClient();

  const folder = path.split("/")[0];
  const { data: listing } = await supabase.storage
    .from(INTAKE_BUCKET)
    .list(folder, { limit: 1000 });
  const exists = (listing ?? []).some((o) => `${folder}/${o.name}` === path);

  if (exists) {
    const { data: removed, error: removeError } = await supabase.storage
      .from(INTAKE_BUCKET)
      .remove([path]);
    if (removeError || !removed?.length) {
      throw new Error(
        "We couldn't remove the stored photo, so nothing was deleted. Please try again.",
      );
    }
  }

  const { error: rowError } = await supabase
    .from("intake_documents")
    .delete()
    .eq("id", documentId);
  if (rowError) {
    throw new Error("The photo was removed but its record wasn't. Please try again.");
  }

  console.info(
    `[intake] document ${documentId} removed (${path}${exists ? "" : ", object already gone"})`,
  );

  if (found.slug) {
    revalidatePath(`/properties/${found.slug}/edit/intake`);
  }
}
