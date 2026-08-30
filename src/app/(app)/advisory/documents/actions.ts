"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { resolveTrustViewer } from "@/lib/trust/auth";
import { recordTrustEvent } from "@/lib/trust/audit";
import { extractPdfPages } from "@/lib/trust/pages";
import {
  proposeTrustTaxonomy,
  type TaxonomyProposal,
} from "@/lib/trust/taxonomy";
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

  // Already granted is done, not an error — and not a new audit row.
  const { data: existing } = await supabase
    .from("trust_document_access")
    .select("document_id")
    .eq("document_id", documentId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (existing) return { ok: true };

  // Audit-or-abort, log-first (the deleteTrustDocument pattern): an unaudited
  // grant to an outside adviser is exactly the row this log exists to prevent,
  // so if the event can't be written the access change doesn't happen.
  const audited = await recordTrustEvent({
    event: "grant_added",
    actorId: gate.userId,
    documentId,
    detail: {
      documentName: doc.name,
      granteeId: person.id,
      granteeName: person.full_name ?? person.email,
    },
  });
  if (!audited) {
    return {
      ok: false,
      message:
        "We couldn't record this change, so the document wasn't shared. Please try again.",
    };
  }

  const { error } = await supabase.from("trust_document_access").insert({
    document_id: documentId,
    profile_id: profileId,
    granted_by: gate.userId,
  });
  if (error && error.code !== "23505") {
    // The event row stands for a grant that then failed — over-logging is the
    // accepted direction for an append-only log.
    console.error("[trust] could not grant access", error);
    return { ok: false, message: "We couldn't share that document. Please try again." };
  }

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

  // Nothing to revoke is done, not an error — and not a new audit row.
  const { data: existing } = await supabase
    .from("trust_document_access")
    .select("document_id")
    .eq("document_id", documentId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!existing) return { ok: true };

  // Audit-or-abort, log-first, same as grant.
  const audited = await recordTrustEvent({
    event: "grant_revoked",
    actorId: gate.userId,
    documentId,
    detail: {
      documentName: doc.name,
      granteeId: profileId,
      granteeName: person?.full_name ?? person?.email ?? null,
    },
  });
  if (!audited) {
    return {
      ok: false,
      message:
        "We couldn't record this change, so the access wasn't removed. Please try again.",
    };
  }

  const { error } = await supabase
    .from("trust_document_access")
    .delete()
    .eq("document_id", documentId)
    .eq("profile_id", profileId);
  if (error) {
    console.error("[trust] could not revoke access", error);
    return { ok: false, message: "We couldn't remove that access. Please try again." };
  }

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

  // Exact probe by name (search + exact compare), not a capped folder listing:
  // a truncated listing would misjudge a real object as absent, delete the row,
  // and orphan trust-document bytes forever. Listing (vs. inferring from an
  // empty remove result) still distinguishes "missing" from "permission
  // failure", per the PRD 33 lesson.
  const slash = doc.storage_path.indexOf("/");
  const folder = doc.storage_path.slice(0, slash);
  const fileName = doc.storage_path.slice(slash + 1);
  const { data: listing } = await supabase.storage
    .from(TRUST_BUCKET)
    .list(folder, { limit: 1, search: fileName });
  const exists = (listing ?? []).some((o) => o.name === fileName);
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

  // Already seated is done, not an error — and not a new audit row.
  const { data: seated } = await supabase
    .from("trust_managers")
    .select("profile_id")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (seated) return { ok: true };

  // Audit-or-abort, log-first: a silent roster change defeats the log.
  const audited = await recordTrustEvent({
    event: "manager_added",
    actorId: viewer.userId,
    detail: { managerId: person.id, managerName: person.full_name ?? person.email },
  });
  if (!audited) {
    return {
      ok: false,
      message:
        "We couldn't record this change, so the manager wasn't added. Please try again.",
    };
  }

  const { error } = await supabase.from("trust_managers").insert({
    profile_id: profileId,
    added_by: viewer.userId,
  });
  if (error && error.code !== "23505") {
    console.error("[trust] could not add manager", error);
    return { ok: false, message: "We couldn't add that manager. Please try again." };
  }

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

  // Not seated is done — nothing to remove, nothing to log.
  const { data: seated } = await supabase
    .from("trust_managers")
    .select("profile_id")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!seated) return;

  // Audit-or-abort, log-first, same as the rest of the vault's writes.
  const audited = await recordTrustEvent({
    event: "manager_removed",
    actorId: viewer.userId,
    detail: {
      managerId: profileId,
      managerName: person?.full_name ?? person?.email ?? null,
    },
  });
  if (!audited) {
    throw new Error(
      "We couldn't record this change, so the manager wasn't removed. Please try again.",
    );
  }

  const { error } = await supabase
    .from("trust_managers")
    .delete()
    .eq("profile_id", profileId);
  if (error) {
    console.error("[trust] could not remove manager", error);
    throw new Error("We couldn't remove that manager. Please try again.");
  }

  revalidatePath(ADVISORY_DOCUMENTS_PATH);
}

// ── Inferred taxonomy (PRD 40 slice 2) ──────────────────────────────────────

export type RegisterDocument = { id: string; name: string };

export type ProposeTaxonomyState =
  | { ok: true; proposal: TaxonomyProposal }
  | { ok: false; message: string };

/**
 * Ask for a proposed organization of the register. Reads only; the proposal
 * lives in the manager's review screen until applyTrustTaxonomy. Existing
 * categories ride along so a re-run extends the approved structure instead of
 * reshuffling it.
 */
export async function proposeTaxonomyAction(): Promise<ProposeTaxonomyState> {
  const gate = await requireTrustManager();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const [{ data: docs }, { data: pages }, { data: cats }] = await Promise.all([
    supabase
      .from("trust_documents")
      .select("id, name, category_id")
      .eq("kind", "document")
      .returns<{ id: string; name: string; category_id: string | null }[]>(),
    supabase
      .from("trust_document_pages")
      .select("document_id, text")
      .eq("page_number", 1)
      .returns<{ document_id: string; text: string }[]>(),
    supabase
      .from("trust_categories")
      .select("id, name, description")
      .returns<{ id: string; name: string; description: string | null }[]>(),
  ]);

  const register = docs ?? [];
  if (register.length === 0) {
    return { ok: false, message: "There are no documents to organize yet." };
  }

  const firstPage = new Map((pages ?? []).map((p) => [p.document_id, p.text]));
  const existingCategories = (cats ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    documentIds: register.filter((d) => d.category_id === c.id).map((d) => d.id),
  }));

  const result = await proposeTrustTaxonomy({
    documents: register.map((d) => ({
      id: d.id,
      name: d.name,
      firstPageText: firstPage.get(d.id) ?? "",
    })),
    existingCategories,
  });
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, proposal: result.proposal };
}

export type ApplyTaxonomyInput = {
  categories: {
    existingCategoryId: string | null;
    name: string;
    description: string | null;
    documentIds: string[];
  }[];
};

/**
 * Apply a manager-approved organization. The payload is the WHOLE register's
 * mapping: listed documents get their category, unlisted ones become
 * uncategorized, and existing categories absent from the payload are removed.
 * Full-mapping semantics keep apply predictable and re-runnable — pressing
 * Apply twice with the same review state is a no-op.
 *
 * Audit-or-abort, log-first, one summary event. A failure partway through
 * leaves a partially applied state a manager can see and fix by re-running
 * the organize flow — every write here is idempotent against re-application.
 */
export async function applyTrustTaxonomy(
  input: ApplyTaxonomyInput,
): Promise<ActionResult> {
  const gate = await requireTrustManager();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const [{ data: docs }, { data: cats }] = await Promise.all([
    supabase
      .from("trust_documents")
      .select("id")
      .eq("kind", "document")
      .returns<{ id: string }[]>(),
    supabase
      .from("trust_categories")
      .select("id")
      .returns<{ id: string }[]>(),
  ]);
  const registerIds = new Set((docs ?? []).map((d) => d.id));
  const existingIds = new Set((cats ?? []).map((c) => c.id));

  // Validate the shape a review screen should never produce anyway; RLS would
  // stop nothing here since a manager is allowed all of these writes.
  const seenDocs = new Set<string>();
  const seenNames = new Set<string>();
  const categories: ApplyTaxonomyInput["categories"] = [];
  for (const c of input.categories ?? []) {
    const name = (c.name ?? "").trim().slice(0, 60);
    if (!name) return { ok: false, message: "Every category needs a name." };
    if (seenNames.has(name.toLowerCase())) {
      return { ok: false, message: `Two categories are both named "${name}".` };
    }
    seenNames.add(name.toLowerCase());
    const documentIds: string[] = [];
    for (const id of c.documentIds ?? []) {
      if (!registerIds.has(id)) continue;
      if (seenDocs.has(id)) {
        return { ok: false, message: "A document is listed in two categories." };
      }
      seenDocs.add(id);
      documentIds.push(id);
    }
    if (documentIds.length === 0) {
      return {
        ok: false,
        message: `"${name}" has no documents. Remove it, or move a document in.`,
      };
    }
    categories.push({
      existingCategoryId:
        c.existingCategoryId && existingIds.has(c.existingCategoryId)
          ? c.existingCategoryId
          : null,
      name,
      description: c.description?.trim() ? c.description.trim().slice(0, 200) : null,
      documentIds,
    });
  }

  const keptCategoryIds = new Set(
    categories.map((c) => c.existingCategoryId).filter((id): id is string => !!id),
  );
  const removedCategoryIds = [...existingIds].filter((id) => !keptCategoryIds.has(id));
  const uncategorized = [...registerIds].filter((id) => !seenDocs.has(id));

  const audited = await recordTrustEvent({
    event: "taxonomy_applied",
    actorId: gate.userId,
    detail: {
      categories: categories.length,
      newCategories: categories.filter((c) => !c.existingCategoryId).length,
      removedCategories: removedCategoryIds.length,
      assigned: seenDocs.size,
      uncategorized: uncategorized.length,
    },
  });
  if (!audited) {
    return {
      ok: false,
      message:
        "We couldn't record this change, so the organization wasn't applied. Please try again.",
    };
  }

  // Removed categories go FIRST (PR #53 review): trust_categories.name is
  // unique, so a manager who removes a category and recreates one with the
  // same name (or renames a kept category onto a removed one's name) would
  // otherwise collide with the not-yet-deleted row, and every retry would
  // replay the same failure. Deleting up front is safe: the FK is SET NULL,
  // and every affected document is re-pointed or explicitly cleared below.
  // (A pure A<->B name swap between two KEPT categories can still collide —
  // rare enough to accept; the error message names the duplicate.)
  if (removedCategoryIds.length > 0) {
    const { error } = await supabase
      .from("trust_categories")
      .delete()
      .in("id", removedCategoryIds);
    if (error) {
      console.error("[trust] taxonomy: category removal failed", error);
      return { ok: false, message: "We couldn't apply the organization. Please try again." };
    }
  }

  for (let i = 0; i < categories.length; i++) {
    const c = categories[i]!;
    let categoryId = c.existingCategoryId;
    if (categoryId) {
      const { error } = await supabase
        .from("trust_categories")
        .update({ name: c.name, description: c.description, position: i })
        .eq("id", categoryId);
      if (error) {
        console.error("[trust] taxonomy: category update failed", error);
        return { ok: false, message: "We couldn't apply the organization. Please try again." };
      }
    } else {
      const { data: row, error } = await supabase
        .from("trust_categories")
        .insert({
          name: c.name,
          description: c.description,
          position: i,
          created_by: gate.userId,
        })
        .select("id")
        .single<{ id: string }>();
      if (error || !row) {
        console.error("[trust] taxonomy: category insert failed", error);
        return { ok: false, message: "We couldn't apply the organization. Please try again." };
      }
      categoryId = row.id;
    }

    const { error: assignError } = await supabase
      .from("trust_documents")
      .update({ category_id: categoryId })
      .in("id", c.documentIds);
    if (assignError) {
      console.error("[trust] taxonomy: assignment failed", assignError);
      return { ok: false, message: "We couldn't apply the organization. Please try again." };
    }
  }

  if (uncategorized.length > 0) {
    const { error } = await supabase
      .from("trust_documents")
      .update({ category_id: null })
      .in("id", uncategorized);
    if (error) {
      console.error("[trust] taxonomy: clearing failed", error);
      return { ok: false, message: "We couldn't apply the organization. Please try again." };
    }
  }

  revalidatePath(ADVISORY_DOCUMENTS_PATH);
  revalidatePath(`${ADVISORY_DOCUMENTS_PATH}/organize`);
  return { ok: true };
}
