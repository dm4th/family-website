// Browser-only image downscaling for the direct-to-Storage upload path (PRD 17).
//
// The headline problem this solves: a 9.2MB laptop JPEG was stored and served
// as-is, so every display surface pulled multi-megabyte originals to paint
// postage-stamp thumbnails. Here we shrink + re-encode in the browser *before*
// the upload, mirroring what the Google Photos import already does (2048px max).
//
// Uses createImageBitmap + <canvas>.toBlob — no dependencies. Anything the
// browser can't decode to a bitmap (notably HEIC on most engines) or that we
// must not flatten (animated GIFs) is passed through untouched rather than
// failing the upload.

import {
  DISPLAY_MAX_DIMENSION,
  THUMB_MAX_DIMENSION,
  DISPLAY_QUALITY,
  THUMB_QUALITY,
} from "@/lib/photo-utils";

export type PreparedUpload = {
  /** The bytes to store at the primary path. */
  display: Blob;
  /** Small companion thumbnail, or null when we passed the original through. */
  thumb: Blob | null;
  /** Content-Type to set on the display upload. */
  contentType: string;
  /** File name whose extension drives the storage path (e.g. "photo.jpg"). */
  outputName: string;
  /** True when we could not re-encode and are storing the original as-is. */
  passthrough: boolean;
};

// Formats we deliberately never re-encode: GIFs (would lose animation) and the
// HEIC/HEIF family (most browsers can't decode them to a canvas). These pass
// through and simply won't get a thumbnail — callers fall back to the full
// object for those.
function isPassthroughType(type: string): boolean {
  const t = type.toLowerCase();
  return (
    t === "image/gif" ||
    t === "image/heic" ||
    t === "image/heif"
  );
}

function jpegName(originalName: string): string {
  const dot = originalName.lastIndexOf(".");
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  return `${base || "photo"}.jpg`;
}

/** Scale factor that fits the longest edge within `maxEdge` (never upscales). */
function scaleToFit(width: number, height: number, maxEdge: number): number {
  const longest = Math.max(width, height);
  return longest > maxEdge ? maxEdge / longest : 1;
}

async function encodeAt(
  bitmap: ImageBitmap,
  maxEdge: number,
  quality: number,
): Promise<Blob | null> {
  const scale = scaleToFit(bitmap.width, bitmap.height, maxEdge);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, w, h);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

/**
 * Prepare a picked File for upload: a 2048px-max display JPEG plus a 400px-max
 * thumbnail. On any decode/encode failure (or an intentionally passed-through
 * format) returns the original File as `display` with `thumb: null` so the
 * upload still succeeds.
 */
export async function prepareImageForUpload(file: File): Promise<PreparedUpload> {
  const fallback: PreparedUpload = {
    display: file,
    thumb: null,
    contentType: file.type || "application/octet-stream",
    outputName: file.name,
    passthrough: true,
  };

  if (isPassthroughType(file.type)) return fallback;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // HEIC and other engine-specific decode failures land here — pass through.
    return fallback;
  }

  try {
    const display = await encodeAt(bitmap, DISPLAY_MAX_DIMENSION, DISPLAY_QUALITY);
    if (!display) return fallback;
    const thumb = await encodeAt(bitmap, THUMB_MAX_DIMENSION, THUMB_QUALITY);
    return {
      display,
      thumb,
      contentType: "image/jpeg",
      outputName: jpegName(file.name),
      passthrough: false,
    };
  } finally {
    bitmap.close();
  }
}

/**
 * Make a thumbnail from an already-downscaled Blob (used by the Google Photos
 * import path, whose bytes are already ≤2048px). Returns null if the Blob can't
 * be decoded — the caller skips the thumb and relies on the full-object fallback.
 */
export async function makeThumbnailFromBlob(blob: Blob): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  try {
    return await encodeAt(bitmap, THUMB_MAX_DIMENSION, THUMB_QUALITY);
  } finally {
    bitmap.close();
  }
}
