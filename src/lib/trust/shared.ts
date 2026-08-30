// Browser-safe trust-vault constants and path helpers (PRD 40). No server-only
// imports, mirroring photo-utils: the upload surface talks straight to Supabase
// Storage from the browser (the Vercel body-limit lesson from PRD 05), so these
// must be importable from Client Components.

export const TRUST_BUCKET = "trust";

/**
 * The two drop zones, and the two kinds of thing in the vault. 'document' is a
 * digital original dragged out of the old Dropbox container; 'scan' is a
 * photographed or scanned notebook page waiting for slice 3's OCR + review.
 */
export type TrustUploadKind = "document" | "scan";

/**
 * What each zone accepts. Documents are PDFs for now — that's what the Dropbox
 * container holds, and it's the format both the page-text extraction and the
 * future adviser can actually read. Scans are the image types a phone camera or
 * desktop scanner produces (HEIC included: the browser-side image preparation
 * re-encodes it to JPEG when it can, same as the photo pipeline). A PDF is
 * accepted in the scan zone too, because flatbed scanners love emitting PDFs.
 */
export const TRUST_DOCUMENT_MIMES = new Set(["application/pdf"]);
export const TRUST_SCAN_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

/** Ceiling per file. Trust PDFs run long but not huge; 50MB is generous. */
export const MAX_TRUST_BYTES = 50 * 1024 * 1024;

/**
 * Object names are UUIDs under a per-kind prefix; the real document name lives
 * only on the trust_documents row. A storage listing on its own reveals nothing,
 * and the naming leaves room for app-layer envelope encryption later (deferred
 * 2026-08-30) without re-uploading.
 */
export function generateTrustPath(kind: TrustUploadKind, originalName: string): string {
  const prefix = kind === "document" ? "documents" : "scans";
  const ext = inferTrustExtension(originalName);
  return `${prefix}/${crypto.randomUUID()}${ext}`;
}

/**
 * Server-side guard: only paths this app generates can be registered, so a
 * malicious client can't attach a vault row to an arbitrary storage object.
 */
export function isValidTrustPath(path: string): boolean {
  return /^(?:documents|scans)\/[0-9a-f-]{36}(?:\.[a-z0-9]+)?$/i.test(path);
}

/** Which kind a stored path claims, from its prefix. */
export function kindFromTrustPath(path: string): TrustUploadKind {
  return path.startsWith("scans/") ? "scan" : "document";
}

function inferTrustExtension(originalName: string): string {
  const dot = originalName.lastIndexOf(".");
  if (dot < 0 || dot === originalName.length - 1) return "";
  const ext = originalName.slice(dot).toLowerCase();
  if (/^\.(pdf|jpg|jpeg|png|webp|heic|heif)$/.test(ext)) return ext;
  return "";
}
