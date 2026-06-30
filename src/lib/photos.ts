// Server-only photo helpers. For browser-safe utilities (path generation,
// MIME validation, size limit) import from `@/lib/photo-utils` instead.

import { createClient } from "@/lib/supabase/server";
import { PHOTOS_BUCKET, thumbPathFor, type Rendition } from "@/lib/photo-utils";

// Re-export the browser-safe bits so existing server callers can keep
// importing from "@/lib/photos".
export {
  PHOTOS_BUCKET,
  ALLOWED_MIME_TYPES,
  MAX_PHOTO_BYTES,
  generatePhotoPath,
  generateGooglePhotoPath,
  isAllowedMime,
  isValidPhotoStoragePath,
  thumbPathFor,
} from "@/lib/photo-utils";
export type { Rendition } from "@/lib/photo-utils";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type PhotoLike = { id: string; storagePath: string };
export type SignedPhoto<T extends PhotoLike> = T & {
  signedUrl: string;
  /**
   * Only set for the "thumb" rendition: the signed URL of the full-size object,
   * for `<img onError>` to swap to when a thumbnail is missing (old uploads,
   * HEIC/GIF, Google imports). Callers that render large (a featured tile or a
   * hero) can also read this directly for a crisp image.
   */
  fallbackUrl?: string;
};

/**
 * Batch-sign a list of photo paths so we can render them in <img> tags.
 * Skips entries whose primary path fails to sign rather than throwing the
 * whole batch.
 *
 * `rendition` ("full" by default) selects which stored object the `signedUrl`
 * points at. For "thumb" we also sign the full object into `fallbackUrl` in the
 * *same* batch call, so there's no extra round-trip and missing thumbs degrade
 * gracefully. "display" and "full" are equivalent today (we store a single
 * 2048px object) — the distinction is kept so call sites read intentfully and
 * so a future medium rendition has a home.
 */
export async function withSignedUrls<T extends PhotoLike>(
  photos: T[],
  rendition: Rendition = "full",
): Promise<SignedPhoto<T>[]> {
  if (photos.length === 0) return [];
  const supabase = await createClient();

  const wantsThumb = rendition === "thumb";

  // Sign every path we might need in one batch: the full objects always, and
  // the thumb companions too when a thumb rendition was requested.
  const fullPaths = photos.map((p) => p.storagePath);
  const thumbPaths = wantsThumb ? photos.map((p) => thumbPathFor(p.storagePath)) : [];

  const { data, error } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrls([...fullPaths, ...thumbPaths], SIGNED_URL_TTL_SECONDS);

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
    const fullUrl = byPath.get(p.storagePath);
    if (!fullUrl) return [];
    if (!wantsThumb) {
      return [{ ...p, signedUrl: fullUrl }];
    }
    const thumbUrl = byPath.get(thumbPathFor(p.storagePath));
    // Prefer the thumb; fall back to the full object if the thumb didn't sign.
    return [{ ...p, signedUrl: thumbUrl ?? fullUrl, fallbackUrl: fullUrl }];
  });
}
