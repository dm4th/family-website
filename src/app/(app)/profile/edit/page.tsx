import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveViewer } from "@/lib/guest";
import { resolveAvatarUrls } from "@/lib/avatars";
import { Eyebrow, LedgerPanel, PageIntro, SalonPanel } from "@/components/shell";
import { ProfilePhotosSection } from "@/components/profile-photos-section";
import { ProfileEditForm } from "./profile-edit-form";
import { GuestProfileForm } from "./guest-profile-form";

export const dynamic = "force-dynamic";

export default async function ProfileEditPage() {
  const supabase = await createClient();
  const viewer = await resolveViewer();
  if (!viewer) notFound();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, avatar_url, family_branch, generation, relationship_notes, phone, bio",
    )
    .eq("id", viewer.userId)
    .single();

  if (error || !profile) notFound();

  const avatarUrls = await resolveAvatarUrls([
    { id: profile.id, avatarUrl: profile.avatar_url },
  ]);
  const avatarSrc = avatarUrls.get(profile.id)?.url ?? null;

  // A guest is a property renter, not a family member — contact basics only,
  // in Operations framing (PRD 15-R2). No family-tree fields, no "what the
  // family sees" copy.
  if (viewer.isGuest) {
    return (
      <div className="flex flex-col gap-10">
        <PageIntro
          mode="operations"
          eyebrow="Your details"
          title="Your Details"
          context="So your host can reach you during your stay."
        />

        <LedgerPanel className="max-w-2xl">
          <div className="flex flex-col gap-5">
            <Eyebrow>Your photo</Eyebrow>
            <ProfilePhotosSection
              profileId={profile.id}
              userId={viewer.userId}
              avatarSrc={avatarSrc}
              avatarUrl={profile.avatar_url}
              fullName={profile.full_name}
            />
          </div>
        </LedgerPanel>

        <LedgerPanel className="max-w-2xl">
          <GuestProfileForm
            profile={{
              fullName: profile.full_name,
              phone: profile.phone,
            }}
          />
        </LedgerPanel>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <PageIntro
        mode="family"
        eyebrow="Your profile"
        title="What the Family Sees"
        context="Update what other members see when they look you up. Saved revisions are kept for transparency."
      />

      {/* Slice 3: photo lives right here — no clicking through to another page. */}
      <SalonPanel className="max-w-2xl">
        <div className="flex flex-col gap-5">
          <Eyebrow>Your photo</Eyebrow>
          <ProfilePhotosSection
            profileId={profile.id}
            userId={viewer.userId}
            avatarSrc={avatarSrc}
            avatarUrl={profile.avatar_url}
            fullName={profile.full_name}
            isAdmin={viewer.isAdmin}
          />
        </div>
      </SalonPanel>

      <SalonPanel className="max-w-2xl">
        <ProfileEditForm
          profile={{
            id: profile.id,
            fullName: profile.full_name,
            familyBranch: profile.family_branch,
            generation: profile.generation,
            relationshipNotes: profile.relationship_notes,
            phone: profile.phone,
            bio: profile.bio,
          }}
        />
      </SalonPanel>
    </div>
  );
}
