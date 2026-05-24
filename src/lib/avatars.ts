import { createClient } from "@/lib/supabase/server";
import { PHOTOS_BUCKET } from "@/lib/photos";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Resolve a profile's stored avatar_url to a renderable URL.
 *
 * profiles.avatar_url holds one of two things:
 *   - A full http(s) URL (e.g., Google profile photo, copied at signup)
 *   - A relative Supabase Storage path (set when a member promotes one of
 *     their uploaded photos to their avatar)
 *
 * Storage paths get signed; HTTP URLs pass through unchanged.
 */
export async function resolveAvatarUrls(
  profiles: { id: string; avatarUrl: string | null }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();

  const storagePaths: { id: string; path: string }[] = [];
  for (const p of profiles) {
    if (!p.avatarUrl) continue;
    if (/^https?:\/\//i.test(p.avatarUrl)) {
      out.set(p.id, p.avatarUrl);
    } else {
      storagePaths.push({ id: p.id, path: p.avatarUrl });
    }
  }

  if (storagePaths.length === 0) return out;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrls(
      storagePaths.map((s) => s.path),
      SIGNED_URL_TTL_SECONDS,
    );

  if (error || !data) return out;

  const signedByPath = new Map(
    data
      .filter((row) => row.signedUrl && !row.error)
      .map((row) => [row.path ?? "", row.signedUrl]),
  );

  for (const s of storagePaths) {
    const url = signedByPath.get(s.path);
    if (url) out.set(s.id, url);
  }
  return out;
}
