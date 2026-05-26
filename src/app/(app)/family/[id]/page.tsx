import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrls } from "@/lib/avatars";
import { withSignedUrls } from "@/lib/photos";
import { ProfileAvatar } from "@/components/profile-avatar";
import { AddPhotosModal } from "@/components/add-photos-modal";
import {
  Eyebrow,
  SalonPanel,
  SectionRule,
} from "@/components/shell";
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

  const generationLabel = profile.generation
    ? ordinal(profile.generation) + " generation"
    : null;
  const contextLine = [
    profile.family_branch,
    profile.relationship_notes,
    generationLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-14">
      {/* Salon hero — portrait + name + bio. Image-forward, generous. */}
      <SalonPanel anchor className="bg-transparent border-0 px-0 py-0 sm:px-0 sm:py-0 shadow-none">
        <div className="flex flex-col items-start gap-8 sm:flex-row sm:items-end">
          <div className="shrink-0">
            <ProfileAvatar
              name={profile.full_name}
              src={avatarSrc}
              size="hero"
              variant="portrait"
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3 pb-2">
            <Eyebrow>Profile</Eyebrow>
            <h1 className="font-display text-[2.25rem] leading-[1.05] text-foreground sm:text-[2.75rem]">
              {profile.full_name ?? "Unnamed"}
            </h1>
            {contextLine && (
              <p className="text-sm text-foreground-muted">{contextLine}</p>
            )}
            {(isOwnProfile || profile.phone) && (
              <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                {profile.phone && (
                  <a
                    href={`tel:${profile.phone}`}
                    className="text-foreground underline-offset-4 hover:underline"
                  >
                    {profile.phone}
                  </a>
                )}
                {isOwnProfile && (
                  <Link
                    href="/profile/edit"
                    className="text-foreground-muted underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Edit profile
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </SalonPanel>

      {profile.bio && (
        <section className="max-w-prose">
          <Eyebrow className="mb-3">About</Eyebrow>
          <p className="font-display text-xl leading-relaxed text-foreground whitespace-pre-wrap sm:text-[1.375rem]">
            {profile.bio}
          </p>
        </section>
      )}

      <SectionRule label="Archive" />

      <section className="flex flex-col gap-6">
        <header className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-2xl leading-tight text-foreground sm:text-[1.75rem]">
            Photos
          </h2>
          <p className="text-xs text-foreground-subtle">
            Anyone in the family can add to this collection.
          </p>
        </header>

        <AddPhotosModal
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

function ordinal(n: number): string {
  const suffix = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]);
}
