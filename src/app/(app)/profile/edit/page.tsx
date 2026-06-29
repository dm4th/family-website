import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrls } from "@/lib/avatars";
import { Eyebrow, PageIntro, SalonPanel } from "@/components/shell";
import { ProfilePhotosSection } from "@/components/profile-photos-section";
import { ProfileEditForm } from "./profile-edit-form";

export const dynamic = "force-dynamic";

export default async function ProfileEditPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, avatar_url, family_branch, generation, relationship_notes, phone, bio",
    )
    .eq("id", user.id)
    .single();

  if (error || !profile) notFound();

  const avatarUrls = await resolveAvatarUrls([
    { id: profile.id, avatarUrl: profile.avatar_url },
  ]);
  const avatarSrc = avatarUrls.get(profile.id) ?? null;

  const { data: adminCheck } = await supabase.rpc("is_admin");
  const isAdmin = adminCheck === true;

  return (
    <div className="flex flex-col gap-10">
      <PageIntro
        mode="family"
        eyebrow="Your profile"
        title="What the family sees"
        context="Update what other members see when they look you up. Saved revisions are kept for transparency."
      />

      {/* Slice 3: photo lives right here — no clicking through to another page. */}
      <SalonPanel className="max-w-2xl">
        <div className="flex flex-col gap-5">
          <Eyebrow>Your photo</Eyebrow>
          <ProfilePhotosSection
            profileId={profile.id}
            userId={user.id}
            avatarSrc={avatarSrc}
            avatarUrl={profile.avatar_url}
            fullName={profile.full_name}
            isAdmin={isAdmin}
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
