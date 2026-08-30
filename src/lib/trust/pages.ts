// Page-level text extraction for vault documents (PRD 40). SERVER ONLY.
//
// Runs at upload time so the text is sitting in trust_document_pages when
// slice 2's taxonomy pass and slice 3's mapping proposals need it (and later
// PRD 07's embeddings). Plain text via unpdf (serverless-friendly pdf.js
// build) — no model call, no network egress: the document's content stays
// between the user's session and the database.

import { extractText, getDocumentProxy } from "unpdf";

/** Extraction ceiling: a trust document is long, not endless. */
const MAX_PAGES = 500;

/**
 * Extract per-page plain text from a PDF. Returns one string per page (index 0
 * = page 1), trimmed; pages whose text layer is empty (pure image scans) come
 * back as empty strings, which callers store as-is — the row marks the page as
 * existing-but-unread, which is exactly what slice 3's OCR needs to know.
 *
 * Throws on an unparseable file; callers treat that as "no text extracted",
 * never as an upload failure.
 */
export async function extractPdfPages(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  return pages.slice(0, Math.min(totalPages, MAX_PAGES)).map((t) => t.trim());
}
