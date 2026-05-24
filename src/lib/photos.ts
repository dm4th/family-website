// Server-only photo helpers. For browser-safe utilities (path generation,
// MIME validation, size limit) import from `@/lib/photo-utils` instead.

import { createClient } from "@/lib/supabase/server";
import { PHOTOS_BUCKET } from "@/lib/photo-utils";

// Re-export the browser-safe bits so existing server callers can keep
// importing from "@/lib/photos".
export {
  PHOTOS_BUCKET,
  ALLOWED_MIME_TYPES,
  MAX_PHOTO_BYTES,
  generatePhotoPath,
  isAllowedMime,
} from "@/lib/photo-utils";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type PhotoLike = { id: string; storagePath: string };
export type SignedPhoto<T extends PhotoLike> = T & { signedUrl: string };

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
