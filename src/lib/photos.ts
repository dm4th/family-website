import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export const PHOTOS_BUCKET = "photos";

export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

export const MAX_PHOTO_BYTES = 25 * 1024 * 1024; // 25MB

// Signed URLs are good for one hour. Long enough that a page reload won't
// re-fetch every image, short enough that a leaked URL stops working quickly.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type PhotoLike = { id: string; storagePath: string };
export type SignedPhoto<T extends PhotoLike> = T & { signedUrl: string };

/**
 * Generate a random storage path for a new photo. Two-level partitioning by
 * the leading two hex chars keeps the bucket browser usable when we have
 * thousands of files.
 */
export function generatePhotoPath(originalName: string): string {
  const ext = inferExtension(originalName);
  const id = randomUUID();
  return `${id.slice(0, 2)}/${id}${ext}`;
}

function inferExtension(originalName: string): string {
  const dot = originalName.lastIndexOf(".");
  if (dot < 0 || dot === originalName.length - 1) return "";
  const ext = originalName.slice(dot).toLowerCase();
  // Allowlist common extensions; anything else gets dropped.
  if (/^\.(jpg|jpeg|png|webp|gif|heic|heif)$/.test(ext)) return ext;
  return "";
}

export function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME_TYPES.has(mime.toLowerCase());
}

/**
 * Batch-sign a list of photo paths so we can render them in <img> tags.
 * Skips entries that fail to sign rather than throwing the whole batch.
 */
export async function withSignedUrls<T extends PhotoLike>(
  photos: T[],
): Promise<SignedPhoto<T>[]> {
  if (photos.length === 0) return [];
  const supabase = await createClient();
  const paths = photos.map((p) => p.storagePath);

  const { data, error } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    return [];
  }

  const byPath = new Map(
    data
      .filter((row): row is typeof row & { signedUrl: string } =>
        Boolean(row.signedUrl) && !row.error,
      )
      .map((row) => [row.path ?? "", row.signedUrl]),
  );

  return photos.flatMap((p) => {
    const signedUrl = byPath.get(p.storagePath);
    return signedUrl ? [{ ...p, signedUrl }] : [];
  });
}
