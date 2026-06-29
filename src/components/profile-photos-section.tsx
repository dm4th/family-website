import { AddPhotosModal } from "@/components/add-photos-modal";
import { ProfileAvatar } from "@/components/profile-avatar";
import { PhotoGallery } from "@/app/(app)/family/[id]/photo-gallery";
import { getProfilePhotos, avatarStoragePath } from "@/lib/profile-photos";

/**
 * Inline photo management for the signed-in member (PRD 13, slice 3): add a
 * photo and promote one to your avatar without leaving the page. Reuses the
 * exact components the profile detail page uses, so behaviour (upload, Google
 * Photos import, "use as avatar", remove) stays identical everywhere.
 *
 * Server component — it does the photo fetch and hands signed URLs to the
 * client PhotoGallery. Drop it on any page where the current user is editing
 * their own profile (profile/edit, /welcome).
 */
export async function ProfilePhotosSection({
  profileId,
  userId,
  avatarSrc,
  avatarUrl,
  fullName,
  isAdmin = false,
  compact = false,
}: {
  profileId: string;
  userId: string;
  /** Signed/resolved URL for the current avatar, for the preview. */
  avatarSrc: string | null;
  /** Raw stored avatar_url, to know which gallery photo is the current avatar. */
  avatarUrl: string | null;
  fullName: string | null;
  isAdmin?: boolean;
  compact?: boolean;
}) {
  const photos = await getProfilePhotos(profileId);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <ProfileAvatar name={fullName} src={avatarSrc} size="lg" />
        <div className="flex flex-col gap-2">
          <p className="text-sm text-foreground-muted">
            {avatarSrc
              ? "This is your photo. Add another below, or pick a different one to use."
              : "Add a photo so the family can put a face to your name."}
          </p>
          <AddPhotosModal
            attachment={{ kind: "profile", profileId }}
            triggerLabel={avatarSrc ? "Add another photo" : "Add a photo"}
          />
        </div>
      </div>

      {(photos.length > 0 || !compact) && (
        <PhotoGallery
          photos={photos}
          canSetAvatar
          currentAvatarPath={avatarStoragePath(avatarUrl)}
          currentUserId={userId}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
