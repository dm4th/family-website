import { createClient } from "@/lib/supabase/server";
import { PHOTOS_BUCKET, thumbPathFor, type Rendition } from "@/lib/photos";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * A resolved avatar: the URL to render, plus an optional `fallbackUrl` to swap
 * to on load error (only set for the "thumb" rendition, pointing at the full
 * object). HTTP (Google) avatars have no fallback.
 */
export type ResolvedAvatar = { url: string; fallbackUrl: string | null };

/**
 * Resolve profiles' stored avatar_url to renderable URLs.
 *
 * profiles.avatar_url holds one of two things:
 *   - A full http(s) URL (e.g., Google profile photo, copied at signup)
 *   - A relative Supabase Storage path (set when a member promotes one of
 *     their uploaded photos to their avatar)
 *
 * Storage paths get signed; HTTP URLs pass through unchanged. With
 * `rendition: "thumb"` (used by the directory, which paints many small avatars)
 * the small companion thumbnail is signed, with the full object as `fallbackUrl`
 * so avatars without a thumb (older uploads, HEIC) still render.
 */
export async function resolveAvatarUrls(
  profiles: { id: string; avatarUrl: string | null }[],
  rendition: Rendition = "full",
): Promise<Map<string, ResolvedAvatar>> {
  const out = new Map<string, ResolvedAvatar>();

  const storagePaths: { id: string; path: string }[] = [];
  for (const p of profiles) {
    if (!p.avatarUrl) continue;
    if (/^https?:\/\//i.test(p.avatarUrl)) {
      out.set(p.id, { url: p.avatarUrl, fallbackUrl: null });
    } else {
      storagePaths.push({ id: p.id, path: p.avatarUrl });
    }
  }

  if (storagePaths.length === 0) return out;

  const wantsThumb = rendition === "thumb";
  const supabase = await createClient();

  const fullPaths = storagePaths.map((s) => s.path);
  const thumbPaths = wantsThumb ? storagePaths.map((s) => thumbPathFor(s.path)) : [];

  const { data, error } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrls([...fullPaths, ...thumbPaths], SIGNED_URL_TTL_SECONDS);

  if (error || !data) return out;

  const signedByPath = new Map(
    data
      .filter((row) => row.signedUrl && !row.error)
      .map((row) => [row.path ?? "", row.signedUrl]),
  );

  for (const s of storagePaths) {
    const fullUrl = signedByPath.get(s.path);
    if (!fullUrl) continue;
    if (!wantsThumb) {
      out.set(s.id, { url: fullUrl, fallbackUrl: null });
      continue;
    }
    const thumbUrl = signedByPath.get(thumbPathFor(s.path));
    out.set(s.id, { url: thumbUrl ?? fullUrl, fallbackUrl: fullUrl });
  }
  return out;
}
