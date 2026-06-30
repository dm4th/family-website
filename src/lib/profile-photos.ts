// Server-only: fetch a member's tagged photos, signed and ready for the
// PhotoGallery. Mirrors the query on the profile detail page so the inline
// photo section on /profile/edit and the /welcome flow stay in sync with it
// (PRD 13, slice 3).

import { createClient } from "@/lib/supabase/server";
import { withSignedUrls } from "@/lib/photos";

export type ProfilePhoto = {
  id: string;
  storagePath: string;
  caption: string | null;
  signedUrl: string;
  fallbackUrl?: string;
  uploadedBy: string | null;
};

export async function getProfilePhotos(
  profileId: string,
): Promise<ProfilePhoto[]> {
  const supabase = await createClient();

  const { data: subjectRows } = await supabase
    .from("photo_subjects")
    .select(
      "photo_id, photos!inner(id, storage_path, caption, uploaded_by, created_at)",
    )
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false, foreignTable: "photos" });

  type RawPhoto = {
    id: string;
    storage_path: string;
    caption: string | null;
    uploaded_by: string | null;
    created_at: string;
  };

  const rawPhotos: RawPhoto[] = (subjectRows ?? []).flatMap((row) =>
    row.photos ? (Array.isArray(row.photos) ? row.photos : [row.photos]) : [],
  );

  // A photo can link to a profile more than once; dedupe by id.
  const seen = new Set<string>();
  const unique = rawPhotos.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  return withSignedUrls(
    unique.map((p) => ({
      id: p.id,
      storagePath: p.storage_path,
      caption: p.caption,
      uploadedBy: p.uploaded_by,
    })),
    "thumb",
  );
}

/** Storage-path avatars are set from uploaded photos; http(s) avatars (Google) aren't. */
export function avatarStoragePath(avatarUrl: string | null): string | null {
  if (!avatarUrl) return null;
  return /^https?:\/\//i.test(avatarUrl) ? null : avatarUrl;
}
