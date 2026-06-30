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

// Ceiling on what we accept *at the picker*. Phones shoot large originals, so
// we accept up to 25MB, but PhotoUpload downscales in-browser before the
// direct-to-Storage upload, so the *stored* object is typically sub-1MB. The
// old 50MB limit only ever mattered before client-side downscaling existed.
export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;

// --- Display renditions (PRD 17) -------------------------------------------
// We store two objects per device upload: a "display" copy (long edge capped
// at 2048px, ~matches the Google Photos import) and a small "thumb" companion
// for avatars and grid tiles. `rendition` selects which one a call site wants.
export type Rendition = "thumb" | "display" | "full";

// Long-edge pixel caps + JPEG quality for the in-browser re-encode.
export const DISPLAY_MAX_DIMENSION = 2048;
export const THUMB_MAX_DIMENSION = 400;
export const DISPLAY_QUALITY = 0.82;
export const THUMB_QUALITY = 0.72;

/**
 * Companion thumbnail path for a stored photo. `ab/uuid.jpg` → `ab/uuid_thumb.jpg`
 * (and `google/ab/uuid.jpg` → `google/ab/uuid_thumb.jpg`). Deterministic so the
 * signing helper can derive it without a DB column. The thumb is best-effort:
 * if it's missing (old uploads, HEIC/GIF, Google imports), callers fall back to
 * the full object, so a thumb path that 404s is never fatal.
 */
export function thumbPathFor(storagePath: string): string {
  const slash = storagePath.lastIndexOf("/");
  const dir = slash >= 0 ? storagePath.slice(0, slash + 1) : "";
  const file = slash >= 0 ? storagePath.slice(slash + 1) : storagePath;
  const dot = file.lastIndexOf(".");
  if (dot <= 0) return `${dir}${file}_thumb`;
  return `${dir}${file.slice(0, dot)}_thumb${file.slice(dot)}`;
}

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

/**
 * Storage path for a photo imported via Google Photos Picker. Lives under
 * a `google/` prefix so source can be inferred from the path alone — useful
 * for the admin storage dashboard.
 */
export function generateGooglePhotoPath(originalName: string): string {
  const ext = inferExtension(originalName);
  const id = crypto.randomUUID();
  return `google/${id.slice(0, 2)}/${id}${ext}`;
}

/**
 * Server-side guard: accept either a device-upload path (`<2hex>/<uuid>.<ext>`)
 * or a Google-picker path (`google/<2hex>/<uuid>.<ext>`). Rejects anything
 * else so a malicious client can't attach a metadata row to an arbitrary
 * storage object.
 */
export function isValidPhotoStoragePath(path: string): boolean {
  return /^(?:google\/)?[0-9a-f]{2}\/[0-9a-f-]{36}(?:\.[a-z0-9]+)?$/i.test(path);
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
