import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Update what other family members see when they look you up.
        </p>
      </div>
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
    </div>
  );
}
