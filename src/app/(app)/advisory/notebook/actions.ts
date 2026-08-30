"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { resolveTrustViewer } from "@/lib/trust/auth";
import { recordTrustEvent } from "@/lib/trust/audit";
import {
  proposeScanMappings,
  readTrustScan,
  selectMappingCandidates,
} from "@/lib/trust/notebook";
import { TRUST_BUCKET } from "@/lib/trust/shared";

const NOTEBOOK_PATH = "/advisory/notebook";
const DOCUMENTS_PATH = "/advisory/documents";

type ActionResult = { ok: true } | { ok: false; message: string };

async function requireTrustManager(): Promise<
  | { ok: true; userId: string }
  | { ok: false; message: string }
> {
  const viewer = await resolveTrustViewer();
  if (!viewer) return { ok: false, message: "Please sign in and try again." };
  if (!viewer.isTrustManager) {
    return { ok: false, message: "Only trust managers can do this." };
  }
  return { ok: true, userId: viewer.userId };
}

export type ExtractScanResult =
  | { ok: true; keyPoints: number; mapped: number; mappingMessage: string | null }
  | { ok: false; message: string };

/**
 * Read one notebook scan: transcription into trust_document_pages, key points
 * into PENDING trust_annotations, then best-effort mapping proposals.
 *
 * Re-read semantics: the transcription and PENDING points are replaced;
 * APPROVED and DENIED rows are untouched, and a re-proposed point whose text
 * matches an already-judged one is dropped — a manager's verdict is never
 * re-litigated by pressing the button again.
 *
 * Audit-or-abort, log-first (`scan_read`): an unauditable read doesn't run.
 */
export async function extractTrustScan(
  documentId: string,
): Promise<ExtractScanResult> {
  const gate = await requireTrustManager();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("trust_documents")
    .select("id, name, kind, storage_path, content_type")
    .eq("id", documentId)
    .maybeSingle<{
      id: string;
      name: string;
      kind: string;
      storage_path: string;
      content_type: string;
    }>();
  if (!doc || doc.kind !== "scan") {
    return { ok: false, message: "That notebook page couldn't be found." };
  }

  const audited = await recordTrustEvent({
    event: "scan_read",
    actorId: gate.userId,
    documentId: doc.id,
    detail: { name: doc.name },
  });
  if (!audited) {
    return {
      ok: false,
      message: "We couldn't record this read, so nothing was read. Please try again.",
    };
  }

  const { data: file, error: downloadError } = await supabase.storage
    .from(TRUST_BUCKET)
    .download(doc.storage_path);
  if (downloadError || !file) {
    return { ok: false, message: "We couldn't open that page's stored file." };
  }

  const result = await readTrustScan({
    bytes: new Uint8Array(await file.arrayBuffer()),
    contentType: (file.type || doc.content_type).toLowerCase(),
  });
  if (!result.ok) return { ok: false, message: result.message };
  const { read } = result;

  // Replace the transcription (update policy landed in this slice's
  // migration, so upsert handles both first reads and re-reads).
  if (read.pages.length > 0) {
    const { error: pagesError } = await supabase.from("trust_document_pages").upsert(
      read.pages.map((p) => ({
        document_id: doc.id,
        page_number: p.page,
        text: p.transcription,
      })),
      { onConflict: "document_id,page_number" },
    );
    if (pagesError) {
      console.error("[trust] could not store transcription", pagesError);
      return {
        ok: false,
        message: "We couldn't save the transcription. Please try again.",
      };
    }
  }

  // Judged points stand; pending ones are this read's to replace.
  const { data: existing } = await supabase
    .from("trust_annotations")
    .select("id, text, status")
    .eq("scan_document_id", doc.id)
    .returns<{ id: string; text: string; status: string }[]>();
  const judged = new Set(
    (existing ?? [])
      .filter((a) => a.status !== "pending")
      .map((a) => a.text.trim().toLowerCase()),
  );
  const { error: clearError } = await supabase
    .from("trust_annotations")
    .delete()
    .eq("scan_document_id", doc.id)
    .eq("status", "pending");
  if (clearError) {
    console.error("[trust] could not clear pending annotations", clearError);
    return { ok: false, message: "We couldn't refresh the earlier read. Please try again." };
  }

  const freshPoints = read.keyPoints.filter(
    (k) => !judged.has(k.text.trim().toLowerCase()),
  );

  // Mapping candidates come from the DIGITAL documents only — matching a note
  // against another note proves nothing.
  let mapped = 0;
  let mappingMessage: string | null = null;
  const proposals: (typeof freshPoints[number] & {
    mappedDocumentId: string | null;
    mappedPage: number | null;
    mappingNote: string | null;
  })[] = freshPoints.map((k) => ({
    ...k,
    mappedDocumentId: null,
    mappedPage: null,
    mappingNote: null,
  }));

  if (freshPoints.length > 0) {
    const { data: docPages } = await supabase
      .from("trust_document_pages")
      .select("document_id, page_number, text, trust_documents!inner(id, name, kind)")
      .eq("trust_documents.kind", "document")
      .returns<
        {
          document_id: string;
          page_number: number;
          text: string;
          trust_documents: { id: string; name: string; kind: string };
        }[]
      >();

    const candidates = selectMappingCandidates(
      freshPoints,
      (docPages ?? []).map((p) => ({
        documentId: p.document_id,
        documentName: p.trust_documents.name,
        page: p.page_number,
        text: p.text,
      })),
    );

    if (candidates.length > 0) {
      const mappingResult = await proposeScanMappings({
        keyPoints: freshPoints.map((k) => ({
          text: k.text,
          sourceQuote: k.sourceQuote,
        })),
        candidates,
      });
      if (mappingResult.ok) {
        for (const m of mappingResult.mappings) {
          const target = proposals[m.keyPointIndex];
          if (target && m.documentId) {
            target.mappedDocumentId = m.documentId;
            target.mappedPage = m.page;
            target.mappingNote = m.note;
            mapped += 1;
          }
        }
      } else {
        // Best-effort: the points still land, just unlinked.
        mappingMessage = mappingResult.message;
      }
    }
  }

  if (proposals.length > 0) {
    const { error: insertError } = await supabase.from("trust_annotations").insert(
      proposals.map((p) => ({
        scan_document_id: doc.id,
        scan_page: p.page,
        text: p.text,
        source_quote: p.sourceQuote,
        confidence: p.confidence,
        mapped_document_id: p.mappedDocumentId,
        mapped_page: p.mappedPage,
        mapping_note: p.mappingNote,
        created_by: gate.userId,
      })),
    );
    if (insertError) {
      console.error("[trust] could not store annotations", insertError);
      return {
        ok: false,
        message:
          "The page was read but its points couldn't be saved. Please try again.",
      };
    }
  }

  revalidatePath(NOTEBOOK_PATH);
  revalidatePath(`${NOTEBOOK_PATH}/review/${doc.id}`);
  return { ok: true, keyPoints: proposals.length, mapped, mappingMessage };
}

/**
 * Approve one point, with whatever edits the manager made in review. The
 * approved text and mapping are what the adviser corpus will eventually
 * trust, so this is the gate: audit-or-abort, log-first.
 */
export async function approveTrustAnnotation(input: {
  id: string;
  text: string;
  mappedDocumentId: string | null;
  mappedPage: number | null;
}): Promise<ActionResult> {
  const gate = await requireTrustManager();
  if (!gate.ok) return gate;

  const text = input.text.trim().slice(0, 400);
  if (!text) return { ok: false, message: "An approved point can't be empty." };

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("trust_annotations")
    .select("id, status, scan_document_id, trust_documents!trust_annotations_scan_document_id_fkey(name)")
    .eq("id", input.id)
    .maybeSingle<{
      id: string;
      status: string;
      scan_document_id: string;
      trust_documents: { name: string } | null;
    }>();
  if (!row) return { ok: false, message: "That point couldn't be found." };
  if (row.status === "approved") return { ok: true };

  let mappedDocumentId: string | null = null;
  let mappedPage: number | null = null;
  if (input.mappedDocumentId) {
    const { data: target } = await supabase
      .from("trust_documents")
      .select("id, kind")
      .eq("id", input.mappedDocumentId)
      .maybeSingle<{ id: string; kind: string }>();
    if (!target || target.kind !== "document") {
      return { ok: false, message: "That linked document couldn't be found." };
    }
    mappedDocumentId = target.id;
    mappedPage =
      input.mappedPage && input.mappedPage >= 1 ? Math.floor(input.mappedPage) : null;
  }

  const audited = await recordTrustEvent({
    event: "annotation_approved",
    actorId: gate.userId,
    documentId: row.scan_document_id,
    detail: {
      scanName: row.trust_documents?.name ?? null,
      point: text.slice(0, 120),
      mappedDocumentId,
    },
  });
  if (!audited) {
    return {
      ok: false,
      message: "We couldn't record this approval, so nothing was approved. Please try again.",
    };
  }

  const { error } = await supabase
    .from("trust_annotations")
    .update({
      text,
      mapped_document_id: mappedDocumentId,
      mapped_page: mappedPage,
      status: "approved",
      reviewed_by: gate.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) {
    console.error("[trust] could not approve annotation", error);
    return { ok: false, message: "We couldn't approve that point. Please try again." };
  }

  revalidatePath(NOTEBOOK_PATH);
  revalidatePath(`${NOTEBOOK_PATH}/review/${row.scan_document_id}`);
  revalidatePath(DOCUMENTS_PATH);
  return { ok: true };
}

/** Deny one point. Denied rows are kept so a re-read can't re-propose them. */
export async function denyTrustAnnotation(id: string): Promise<ActionResult> {
  const gate = await requireTrustManager();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("trust_annotations")
    .select("id, status, scan_document_id, text, trust_documents!trust_annotations_scan_document_id_fkey(name)")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      status: string;
      scan_document_id: string;
      text: string;
      trust_documents: { name: string } | null;
    }>();
  if (!row) return { ok: false, message: "That point couldn't be found." };
  if (row.status === "denied") return { ok: true };

  const audited = await recordTrustEvent({
    event: "annotation_denied",
    actorId: gate.userId,
    documentId: row.scan_document_id,
    detail: {
      scanName: row.trust_documents?.name ?? null,
      point: row.text.slice(0, 120),
    },
  });
  if (!audited) {
    return {
      ok: false,
      message: "We couldn't record this, so nothing changed. Please try again.",
    };
  }

  const { error } = await supabase
    .from("trust_annotations")
    .update({
      status: "denied",
      reviewed_by: gate.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    console.error("[trust] could not deny annotation", error);
    return { ok: false, message: "We couldn't set that aside. Please try again." };
  }

  revalidatePath(NOTEBOOK_PATH);
  revalidatePath(`${NOTEBOOK_PATH}/review/${row.scan_document_id}`);
  return { ok: true };
}
