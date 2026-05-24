// Browser-safe photo utilities. No server-only imports (no next/headers,
// no @/lib/supabase/server) so this module can be used from Client
// Components for direct-to-Supabase uploads.

export const PHOTOS_BUCKET = "photos";

export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

// Supabase Storage on the Free tier accepts files up to 50MB by default.
// We allow up to 50MB here; the client uploads directly to Storage, so the
// Vercel Function 4.5MB body limit doesn't apply.
export const MAX_PHOTO_BYTES = 50 * 1024 * 1024;

/**
 * Generate a random storage path for a new photo. Two-level partitioning by
 * the leading two hex chars keeps the bucket browser usable when we have
 * thousands of files.
 *
 * Uses globalThis.crypto.randomUUID() which is available in modern browsers
 * and Node 16+ — no `node:crypto` import.
 */
export function generatePhotoPath(originalName: string): string {
  const ext = inferExtension(originalName);
  const id = crypto.randomUUID();
  return `${id.slice(0, 2)}/${id}${ext}`;
}

function inferExtension(originalName: string): string {
  const dot = originalName.lastIndexOf(".");
  if (dot < 0 || dot === originalName.length - 1) return "";
  const ext = originalName.slice(dot).toLowerCase();
  if (/^\.(jpg|jpeg|png|webp|gif|heic|heif)$/.test(ext)) return ext;
  return "";
}

export function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME_TYPES.has(mime.toLowerCase());
}
