import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { PageIntro, SalonPanel } from "@/components/shell";
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
      "id, full_name, family_branch, generation, relationship_notes, phone, bio",
    )
    .eq("id", user.id)
    .single();

  if (error || !profile) notFound();

  return (
    <div className="flex flex-col gap-10">
      <PageIntro
        mode="family"
        eyebrow="Your profile"
        title="What the family sees"
        context="Update what other members see when they look you up. Saved revisions are kept for transparency."
      />
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
