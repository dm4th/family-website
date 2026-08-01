import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrls } from "@/lib/avatars";
import { firstNameFromEmail } from "@/lib/display-name";
import { ProfilePhotosSection } from "@/components/profile-photos-section";
import { deriveRelatives, type TreeEdge } from "@/lib/family-tree";
import { WelcomeFlow } from "./welcome-flow";
import { findClaimCandidates } from "./actions";
import type { PersonSuggestion, TreeStepData } from "./tree-step";

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
    .select(
      "id, full_name, family_branch, generation, phone, bio, avatar_url, onboarded_at",
    )
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/");

  // Is this member actually finished? "Placed in the tree" is part of the
  // answer now (PRD 39), which is why this is no longer just an onboarded_at
  // check: the dashboard nudge sends people back here to finish, and a gate
  // keyed on the stamp alone would bounce them straight back to the dashboard.
  const { data: linkedPerson } = await supabase
    .from("people")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  const hasIdentity = Boolean(
    profile.full_name?.trim() && profile.family_branch,
  );
  const hasGeneration = profile.generation != null;
  const isPlaced = Boolean(linkedPerson);

  // Nothing left to do → don't make them sit through the flow again.
  if (profile.onboarded_at && hasIdentity && hasGeneration && isPlaced) {
    redirect("/");
  }

  // Resume where they stopped rather than replaying steps they finished.
  const initialStep = !hasIdentity ? 0 : !isPlaced || !hasGeneration ? 1 : 2;

  const avatarUrls = await resolveAvatarUrls([
    { id: profile.id, avatarUrl: profile.avatar_url },
  ]);
  const avatarSrc = avatarUrls.get(profile.id)?.url ?? null;

  const greetingName =
    profile.full_name?.trim().split(/\s+/)[0] ||
    firstNameFromEmail(user.email) ||
    "there";

  const treeData = await loadTreeStepData(
    supabase,
    // Someone already linked to a person row can't claim another one, so don't
    // offer the claim card to them at all.
    isPlaced ? "" : ((profile.full_name as string | null) ?? ""),
    (profile.generation as number | null) ?? null,
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-5 py-12 sm:px-8">
      <WelcomeFlow
        greetingName={greetingName}
        initialStep={initialStep}
        alreadyPlaced={isPlaced}
        defaultFullName={profile.full_name}
        defaultFamilyBranch={profile.family_branch}
        defaultPhone={profile.phone}
        defaultBio={profile.bio}
        treeData={treeData}
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

/**
 * Everything the tree step needs, in one server pass (PRD 39).
 *
 * The whole edge list ships to the client because the graph is a few dozen
 * people and the generation suggestion has to recompute as parents are picked;
 * a round trip per selection would be worse in every way.
 */
async function loadTreeStepData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fullName: string,
  currentGeneration: number | null,
): Promise<TreeStepData> {
  const [{ data: edgeRows }, { data: linked }, { data: hintRows }] =
    await Promise.all([
      supabase.from("relationships").select("id, person_a, person_b, type"),
      // Every person, with the generation of whoever has a linked profile.
      // Not filtered to linked people: the ancestors we need names for (a
      // sibling's parents, say) are precisely the ones with no account.
      supabase
        .from("people")
        .select("id, display_name, profile_id, profiles(generation)"),
      // The inviter's kinship answer. SECURITY DEFINER because invitations RLS
      // hides the invitee's own row from them.
      supabase.rpc("my_invitation_hint"),
    ]);

  const edges: TreeEdge[] = (edgeRows ?? []).map((r) => ({
    id: r.id as string,
    personA: r.person_a as string,
    personB: r.person_b as string,
    type: r.type as "parent" | "spouse",
  }));

  const knownGenerations: [string, number][] = [];
  const nameById = new Map<string, string>();
  for (const row of linked ?? []) {
    const id = row.id as string;
    nameById.set(id, row.display_name as string);
    const generation = (
      row.profiles as unknown as { generation: number | null } | null
    )?.generation;
    if (typeof generation === "number") knownGenerations.push([id, generation]);
  }

  const hint = (
    hintRows as
      | {
          relation_to_inviter: string | null;
          relation_note: string | null;
          inviter_person_id: string | null;
        }[]
      | null
  )?.[0];

  const { suggestedParents, suggestedSpouse, suggestionReason } =
    deriveSuggestions(hint, edges, nameById);

  return {
    edges,
    knownGenerations,
    suggestedParents,
    suggestedSpouse,
    suggestionReason,
    claimCandidates: fullName ? await findClaimCandidates(fullName) : [],
    defaultGeneration: currentGeneration,
  };
}

/**
 * Turn "who are they to you?" into people to offer.
 *
 * The answer is from the INVITER's point of view, so it inverts here: if they
 * said the invitee is their child, the inviter is the invitee's parent. An
 * answer of "parent" yields nothing, because the step deliberately never asks
 * about children.
 */
function deriveSuggestions(
  hint:
    | {
        relation_to_inviter: string | null;
        relation_note: string | null;
        inviter_person_id: string | null;
      }
    | undefined,
  edges: TreeEdge[],
  nameById: Map<string, string>,
): {
  suggestedParents: PersonSuggestion[];
  suggestedSpouse: PersonSuggestion | null;
  suggestionReason: string | null;
} {
  const none = {
    suggestedParents: [],
    suggestedSpouse: null,
    suggestionReason: null,
  };
  if (!hint?.inviter_person_id || !hint.relation_to_inviter) return none;

  const inviterId = hint.inviter_person_id;
  const inviterName = nameById.get(inviterId);
  if (!inviterName) return none;

  const person = (id: string): PersonSuggestion | null => {
    const displayName = nameById.get(id);
    return displayName ? { id, displayName } : null;
  };

  switch (hint.relation_to_inviter) {
    case "child":
      return {
        suggestedParents: [{ id: inviterId, displayName: inviterName }],
        suggestedSpouse: null,
        suggestionReason: `${inviterName} invited you and said you're their child.`,
      };
    case "spouse":
      return {
        suggestedParents: [],
        suggestedSpouse: { id: inviterId, displayName: inviterName },
        suggestionReason: `${inviterName} invited you and said you're their spouse.`,
      };
    case "sibling": {
      // Siblings share parents, so the inviter's parents are the best guess.
      const parents = deriveRelatives(inviterId, edges)
        .parents.map(person)
        .filter((p): p is PersonSuggestion => p != null);
      if (!parents.length) return none;
      return {
        suggestedParents: parents,
        suggestedSpouse: null,
        suggestionReason: `${inviterName} invited you and said you're their sibling, so you may share parents.`,
      };
    }
    // "parent" and "other" imply nothing this step asks about.
    default:
      return none;
  }
}
