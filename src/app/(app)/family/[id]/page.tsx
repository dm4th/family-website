import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrls } from "@/lib/avatars";
import { withSignedUrls } from "@/lib/photos";
import { ProfileAvatar } from "@/components/profile-avatar";
import { PhotoUpload } from "@/components/photo-upload";
import { PhotoGallery } from "./photo-gallery";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function ProfileDetailPage({ params }: { params: Params }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, avatar_url, family_branch, generation, relationship_notes, phone, bio, deactivated_at",
    )
    .eq("id", id)
    .single();

  if (error || !profile || profile.deactivated_at) notFound();

  const avatarUrls = await resolveAvatarUrls([
    { id: profile.id, avatarUrl: profile.avatar_url },
  ]);
  const avatarSrc = avatarUrls.get(profile.id) ?? null;

  const { data: subjectRows } = await supabase
    .from("photo_subjects")
    .select(
      "photo_id, photos!inner(id, storage_path, caption, taken_at, uploaded_by, created_at)",
    )
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false, foreignTable: "photos" });

  type RawPhoto = {
    id: string;
    storage_path: string;
    caption: string | null;
    taken_at: string | null;
    uploaded_by: string | null;
    created_at: string;
  };
  const rawPhotos: RawPhoto[] = (subjectRows ?? []).flatMap((row) =>
    row.photos
      ? (Array.isArray(row.photos) ? row.photos : [row.photos])
      : [],
  );

  // Dedupe by photo id (a photo could appear via multiple subject links).
  const seen = new Set<string>();
  const uniquePhotos = rawPhotos.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  const signedPhotos = await withSignedUrls(
    uniquePhotos.map((p) => ({
      id: p.id,
      storagePath: p.storage_path,
      caption: p.caption,
      uploadedBy: p.uploaded_by,
    })),
  );

  const isOwnProfile = user?.id === profile.id;

  const subtitle = [
    profile.family_branch,
    profile.relationship_notes,
    profile.generation ? `Gen ${profile.generation}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-10">
      <div className="flex items-start gap-6">
        <ProfileAvatar
          name={profile.full_name}
          src={avatarSrc}
          size="xl"
        />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              {profile.full_name ?? "Unnamed"}
            </h1>
            {isOwnProfile && (
              <Link
                href="/profile/edit"
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                Edit
              </Link>
            )}
          </div>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
          {profile.bio && (
            <p className="text-sm whitespace-pre-wrap pt-2">{profile.bio}</p>
          )}
          {profile.phone && (
            <p className="text-sm text-muted-foreground pt-2">
              Phone:{" "}
              <a
                href={`tel:${profile.phone}`}
                className="text-foreground underline-offset-4 hover:underline"
              >
                {profile.phone}
              </a>
            </p>
          )}
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Photos</h2>
          <p className="text-xs text-muted-foreground">
            Anyone in the family can add to this collection.
          </p>
        </div>

        <PhotoUpload
          attachment={{ kind: "profile", profileId: profile.id }}
        />

        <PhotoGallery
          photos={signedPhotos}
          canSetAvatar={isOwnProfile}
          currentAvatarPath={
            profile.avatar_url && !/^https?:\/\//i.test(profile.avatar_url)
              ? profile.avatar_url
              : null
          }
        />
      </section>
    </div>
  );
}
