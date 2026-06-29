import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrls } from "@/lib/avatars";
import { firstNameFromEmail } from "@/lib/display-name";
import { ProfilePhotosSection } from "@/components/profile-photos-section";
import { WelcomeFlow } from "./welcome-flow";

export const dynamic = "force-dynamic";

export const metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, family_branch, bio, avatar_url, onboarded_at")
    .eq("id", user.id)
    .single();

  // Already through the flow → no reason to be here.
  if (!profile || profile.onboarded_at) redirect("/");

  const avatarUrls = await resolveAvatarUrls([
    { id: profile.id, avatarUrl: profile.avatar_url },
  ]);
  const avatarSrc = avatarUrls.get(profile.id) ?? null;

  const greetingName =
    profile.full_name?.trim().split(/\s+/)[0] ||
    firstNameFromEmail(user.email) ||
    "there";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-5 py-12 sm:px-8">
      <WelcomeFlow
        greetingName={greetingName}
        defaultFullName={profile.full_name}
        defaultFamilyBranch={profile.family_branch}
        defaultBio={profile.bio}
        photoSlot={
          <ProfilePhotosSection
            profileId={profile.id}
            userId={user.id}
            avatarSrc={avatarSrc}
            avatarUrl={profile.avatar_url}
            fullName={profile.full_name}
            compact
          />
        }
      />
    </main>
  );
}
