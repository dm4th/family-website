"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { resolveTrustViewer } from "@/lib/trust/auth";
import { recordTrustEvent } from "@/lib/trust/audit";
import { extractPdfPages } from "@/lib/trust/pages";
import {
  MAX_TRUST_BYTES,
  TRUST_BUCKET,
  TRUST_DOCUMENT_MIMES,
  TRUST_SCAN_MIMES,
  isValidTrustPath,
  kindFromTrustPath,
  type TrustUploadKind,
} from "@/lib/trust/shared";

/**
 * How long an opened document link stays good. Deliberately shorter than the
 * intake bucket's 30 minutes: these are the trust's own documents, and every
 * open is a fresh, audited, deliberate act. Five minutes is enough to load the
 * PDF; re-opening costs one click and one more audit row, which is the point.
 */
const OPEN_URL_TTL_SECONDS = 60 * 5;

const ADVISORY_DOCUMENTS_PATH = "/advisory/documents";

type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * Manager gate shared by every write action. RLS enforces all of it again at
 * the database; this exists for early, well-worded rejections.
 */
async function requireTrustManager(): Promise<
  | { ok: true; userId: string }
  | { ok: false; message: string }
> {
  const viewer = await resolveTrustViewer();
  if (!viewer) return { ok: false, message: "Please sign in and try again." };
  if (!viewer.isTrustManager) {
    return {
      ok: false,
      message: "Only trust managers can do this.",
    };
  }
  return { ok: true, userId: viewer.userId };
}

// ── Upload registration ─────────────────────────────────────────────────────

export type RegisterTrustDocumentResult =
  | { ok: true; documentId: string; pagesExtracted: number | null }
  | { ok: false; message: string };

/**
 * Register a file the browser just uploaded to the trust bucket: create its
 * vault row, extract page text (PDFs), and write the `uploaded` audit event.
 *
 * The bytes went direct-to-Storage from the client (managers only, enforced by
 * the bucket's insert policy) because trust PDFs can dwarf the Vercel function
 * body limit. This action is where the object becomes a *document*: until the
 * row exists, only managers can even read the object back.
 *
 * Audit-first posture: if the audit row cannot be written, the registration is
 * rolled back (row deleted, object removed) — an unauditable vault write does
 * not proceed.
 */
export async function registerTrustDocument(input: {
  storagePath: string;
  name: string;
  contentType: string;
  byteSize: number;
}): Promise<RegisterTrustDocumentResult> {
  const gate = await requireTrustManager();
  if (!gate.ok) return gate;

  if (!isValidTrustPath(input.storagePath)) {
    return { ok: false, message: "That file couldn't be found." };
  }
  const kind: TrustUploadKind = kindFromTrustPath(input.storagePath);

  const name = input.name.trim().slice(0, 300);
  if (!name) {
    return { ok: false, message: "That file needs a name." };
  }

  const supabase = await createClient();

  // Read the object back rather than trusting the client's description: its
  // stored type and size are what we record, and for PDFs the bytes feed the
  // page-text extraction.
  const { data: file, error: downloadError } = await supabase.storage
    .from(TRUST_BUCKET)
    .download(input.storagePath);
  if (downloadError || !file) {
    return {
      ok: false,
      message: "We couldn't open that upload. Please try adding it again.",
    };
  }
  if (file.size > MAX_TRUST_BYTES) {
    await supabase.storage.from(TRUST_BUCKET).remove([input.storagePath]);
    return {
      ok: false,
      message: `That file is larger than ${Math.round(MAX_TRUST_BYTES / 1024 / 1024)}MB.`,
    };
  }

  const contentType = (file.type || input.contentType || "").toLowerCase();
  const allowed = kind === "document" ? TRUST_DOCUMENT_MIMES : TRUST_SCAN_MIMES;
  if (!allowed.has(contentType)) {
    await supabase.storage.from(TRUST_BUCKET).remove([input.storagePath]);
    return {
      ok: false,
      message:
        kind === "document"
          ? "Trust documents need to be PDF files."
          : "Notebook pages need to be photos (JPG, PNG) or scanned PDFs.",
    };
  }

  const { data: row, error: insertError } = await supabase
    .from("trust_documents")
    .insert({
      name,
      kind,
      storage_path: input.storagePath,
      content_type: contentType,
      byte_size: file.size,
      uploaded_by: gate.userId,
    })
    .select("id")
    .single<{ id: string }>();
  if (insertError || !row) {
    console.error("[trust] could not register document", insertError);
    return {
      ok: false,
      message: "We couldn't add that file. Please try again.",
    };
  }

  const audited = await recordTrustEvent({
    event: "uploaded",
    actorId: gate.userId,
    documentId: row.id,
    detail: { name, kind, byteSize: file.size },
  });
  if (!audited) {
    // The vault does not accept writes it cannot account for.
    await supabase.from("trust_documents").delete().eq("id", row.id);
    await supabase.storage.from(TRUST_BUCKET).remove([input.storagePath]);
    return {
      ok: false,
      message: "We couldn't record that upload, so it wasn't added. Please try again.",
    };
  }

  // Page text, best-effort: a scanned/image-only PDF yields empty pages, an
  // unparseable one yields none. Either way the document itself is in — the
  // extraction serves the later taxonomy/mapping passes, not this upload.
  let pagesExtracted: number | null = null;
  if (contentType === "application/pdf") {
    try {
      const pages = await extractPdfPages(
        new Uint8Array(await file.arrayBuffer()),
      );
      if (pages.length > 0) {
        const { error: pagesError } = await supabase
          .from("trust_document_pages")
          .insert(
            pages.map((text, i) => ({
              document_id: row.id,
              page_number: i + 1,
              text,
            })),
          );
        if (pagesError) {
          console.error("[trust] could not store page text", pagesError);
        } else {
          pagesExtracted = pages.length;
        }
      }
    } catch (error) {
      console.error("[trust] page extraction failed", error);
    }
  }

  revalidatePath(ADVISORY_DOCUMENTS_PATH);
  return { ok: true, documentId: row.id, pagesExtracted };
}

// ── Opening ─────────────────────────────────────────────────────────────────

export type OpenTrustDocumentResult =
  | { ok: true; url: string }
  | { ok: false; message: string };

/**
 * Mint a short-lived signed URL for one document, for anyone RLS lets read it
 * (manager or grant holder). The `viewed` audit row is written FIRST — an open
 * that can't be logged doesn't happen. Signing itself re-checks access at the
 * storage layer, so a revoked grant fails here even if a stale page shows the
 * button.
 */
export async function openTrustDocument(
  documentId: string,
): Promise<OpenTrustDocumentResult> {
  const viewer = await resolveTrustViewer();
  if (!viewer) return { ok: false, message: "Please sign in and try again." };

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("trust_documents")
    .select("id, name, storage_path")
    .eq("id", documentId)
    .maybeSingle<{ id: string; name: string; storage_path: string }>();
  if (!doc) {
    return { ok: false, message: "That document couldn't be found." };
  }

  const audited = await recordTrustEvent({
    event: "viewed",
    actorId: viewer.userId,
    documentId: doc.id,
    detail: { name: doc.name },
  });
  if (!audited) {
    return {
      ok: false,
      message: "We couldn't record this view, so the document wasn't opened. Please try again.",
    };
  }

  const { data: signed, error } = await supabase.storage
    .from(TRUST_BUCKET)
    .createSignedUrl(doc.storage_path, OPEN_URL_TTL_SECONDS);
  if (error || !signed?.signedUrl) {
    return {
      ok: false,
      message: "We couldn't open that document. Please try again.",
    };
  }
  return { ok: true, url: signed.signedUrl };
}

// ── Access grants ───────────────────────────────────────────────────────────

export async function grantTrustAccess(
  documentId: string,
  profileId: string,
): Promise<ActionResult> {
  const gate = await requireTrustManager();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const [{ data: doc }, { data: person }] = await Promise.all([
    supabase
      .from("trust_documents")
      .select("id, name")
      .eq("id", documentId)
      .maybeSingle<{ id: string; name: string }>(),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", profileId)
      .maybeSingle<{ id: string; full_name: string | null; email: string }>(),
  ]);
  if (!doc) return { ok: false, message: "That document couldn't be found." };
  if (!person) return { ok: false, message: "That person couldn't be found." };

  const { error } = await supabase.from("trust_document_access").insert({
    document_id: documentId,
    profile_id: profileId,
    granted_by: gate.userId,
  });
  if (error) {
    // Unique violation = already granted; treat as done rather than an error.
    if (error.code === "23505") return { ok: true };
    console.error("[trust] could not grant access", error);
    return { ok: false, message: "We couldn't share that document. Please try again." };
  }

  await recordTrustEvent({
    event: "grant_added",
    actorId: gate.userId,
    documentId,
    detail: {
      documentName: doc.name,
      granteeId: person.id,
      granteeName: person.full_name ?? person.email,
    },
  });

  revalidatePath(ADVISORY_DOCUMENTS_PATH);
  return { ok: true };
}

export async function revokeTrustAccess(
  documentId: string,
  profileId: string,
): Promise<ActionResult> {
  const gate = await requireTrustManager();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const [{ data: doc }, { data: person }] = await Promise.all([
    supabase
      .from("trust_documents")
      .select("id, name")
      .eq("id", documentId)
      .maybeSingle<{ id: string; name: string }>(),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", profileId)
      .maybeSingle<{ id: string; full_name: string | null; email: string }>(),
  ]);
  if (!doc) return { ok: false, message: "That document couldn't be found." };

  const { error } = await supabase
    .from("trust_document_access")
    .delete()
    .eq("document_id", documentId)
    .eq("profile_id", profileId);
  if (error) {
    console.error("[trust] could not revoke access", error);
    return { ok: false, message: "We couldn't remove that access. Please try again." };
  }

  await recordTrustEvent({
    event: "grant_revoked",
    actorId: gate.userId,
    documentId,
    detail: {
      documentName: doc.name,
      granteeId: profileId,
      granteeName: person?.full_name ?? person?.email ?? null,
    },
  });

  revalidatePath(ADVISORY_DOCUMENTS_PATH);
  return { ok: true };
}

// ── Deletion ────────────────────────────────────────────────────────────────

/**
 * Remove a document: audit event first (it survives the row via `detail`),
 * then the stored object, then the row (grants and page text cascade).
 *
 * Object-before-row and orphan tolerance follow the PRD 33 lesson exactly: a
 * failed storage delete leaves a visible, retryable row; a row whose object is
 * already gone still deletes cleanly. Presence is established by listing, not
 * inferred from an empty remove result, because a permission failure looks
 * identical to a missing file there.
 */
export async function deleteTrustDocument(documentId: string): Promise<void> {
  const gate = await requireTrustManager();
  if (!gate.ok) throw new Error(gate.message);

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("trust_documents")
    .select("id, name, kind, storage_path")
    .eq("id", documentId)
    .maybeSingle<{ id: string; name: string; kind: string; storage_path: string }>();
  if (!doc) throw new Error("That document couldn't be found.");

  const audited = await recordTrustEvent({
    event: "document_deleted",
    actorId: gate.userId,
    documentId: doc.id,
    detail: { name: doc.name, kind: doc.kind, storagePath: doc.storage_path },
  });
  if (!audited) {
    throw new Error(
      "We couldn't record this deletion, so nothing was removed. Please try again.",
    );
  }

  const folder = doc.storage_path.split("/")[0];
  const { data: listing } = await supabase.storage
    .from(TRUST_BUCKET)
    .list(folder, { limit: 1000 });
  const exists = (listing ?? []).some(
    (o) => `${folder}/${o.name}` === doc.storage_path,
  );
  if (exists) {
    const { data: removed, error: removeError } = await supabase.storage
      .from(TRUST_BUCKET)
      .remove([doc.storage_path]);
    if (removeError || !removed?.length) {
      throw new Error(
        "We couldn't remove the stored file, so nothing was deleted. Please try again.",
      );
    }
  }

  const { error: rowError } = await supabase
    .from("trust_documents")
    .delete()
    .eq("id", documentId);
  if (rowError) {
    throw new Error(
      "The file was removed but its record wasn't. Please try again.",
    );
  }

  revalidatePath(ADVISORY_DOCUMENTS_PATH);
}

// ── Manager roster (site-admin bootstrap, per the PRD 40 decision grid) ─────

export async function addTrustManager(profileId: string): Promise<ActionResult> {
  const viewer = await resolveTrustViewer();
  if (!viewer) return { ok: false, message: "Please sign in and try again." };
  if (!viewer.isAdmin) {
    return { ok: false, message: "Only site admins can change the manager roster." };
  }

  const supabase = await createClient();
  const { data: person } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", profileId)
    .maybeSingle<{ id: string; full_name: string | null; email: string }>();
  if (!person) return { ok: false, message: "That person couldn't be found." };

  const { error } = await supabase.from("trust_managers").insert({
    profile_id: profileId,
    added_by: viewer.userId,
  });
  if (error) {
    if (error.code === "23505") return { ok: true };
    console.error("[trust] could not add manager", error);
    return { ok: false, message: "We couldn't add that manager. Please try again." };
  }

  await recordTrustEvent({
    event: "manager_added",
    actorId: viewer.userId,
    detail: { managerId: person.id, managerName: person.full_name ?? person.email },
  });

  revalidatePath(ADVISORY_DOCUMENTS_PATH);
  return { ok: true };
}

export async function removeTrustManager(profileId: string): Promise<void> {
  const viewer = await resolveTrustViewer();
  if (!viewer) throw new Error("Please sign in and try again.");
  if (!viewer.isAdmin) {
    throw new Error("Only site admins can change the manager roster.");
  }

  const supabase = await createClient();
  const { data: person } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", profileId)
    .maybeSingle<{ id: string; full_name: string | null; email: string }>();

  const { error } = await supabase
    .from("trust_managers")
    .delete()
    .eq("profile_id", profileId);
  if (error) {
    console.error("[trust] could not remove manager", error);
    throw new Error("We couldn't remove that manager. Please try again.");
  }

  await recordTrustEvent({
    event: "manager_removed",
    actorId: viewer.userId,
    detail: {
      managerId: profileId,
      managerName: person?.full_name ?? person?.email ?? null,
    },
  });

  revalidatePath(ADVISORY_DOCUMENTS_PATH);
}
