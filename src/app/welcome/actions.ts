"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { parseGeneration } from "@/lib/generations";
import { recordRevision } from "@/lib/revisions";
import { lifespan } from "@/lib/family-tree";

export type WelcomeFormState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; message: string };

/**
 * The guided first-run flow (PRD 13, restructured by PRD 39).
 *
 * Three short steps, each with its own action, rather than one six-field card.
 * Saving per step is the deliberate abandonment fix: the member we watched sign
 * in once and vanish left nothing behind, because the single form was all or
 * nothing. Now step 1 alone still puts a name in the directory.
 *
 * `onboarded_at` is stamped only by finishing or by "Finish Later", so the
 * redirect gate keeps bringing an unfinished member back to where they stopped.
 */

// ---------------------------------------------------------------------------
// Step 1 — who you are.
// ---------------------------------------------------------------------------
export async function saveIdentity(
  _prev: WelcomeFormState,
  formData: FormData,
): Promise<WelcomeFormState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { status: "error", message: "You're not signed in." };
  }

  const fullName = readText(formData, "full_name");
  const familyBranch = readText(formData, "family_branch");
  const phone = readText(formData, "phone");

  if (!fullName) {
    return { status: "error", message: "Please add your name." };
  }
  if (!familyBranch) {
    return { status: "error", message: "Please choose your family." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, family_branch: familyBranch, phone })
    .eq("id", user.id);

  if (error) return { status: "error", message: error.message };

  revalidatePath("/", "layout");
  return { status: "saved" };
}

// ---------------------------------------------------------------------------
// Step 2 — your place in the family.
// ---------------------------------------------------------------------------

/** An unlinked `people` row that might be the member themselves. */
export type ClaimCandidate = {
  id: string;
  displayName: string;
  /** "1912 – 1998" / "b. 1945" / "" — enough to tell two same-name people apart. */
  lifespan: string;
  familyBranch: string | null;
};

/**
 * Unlinked people whose name matches the member's, for the claim card.
 *
 * Hand-seeded rows already exist for people who later get accounts, so the
 * common case is that a new member is ALREADY in the tree. Auto-linking on a
 * name match would eventually attach the wrong one of the two Drew Mathiesons,
 * so this only ever offers; the member confirms.
 */
export async function findClaimCandidates(
  fullName: string,
): Promise<ClaimCandidate[]> {
  const name = fullName.trim();
  if (name.length < 2) return [];

  const supabase = await createClient();
  const escaped = name.replace(/[%_]/g, (c) => `\\${c}`);
  const { data, error } = await supabase
    .from("people")
    .select(
      "id, display_name, family_branch, birth_date, birth_circa, death_date, death_circa",
    )
    .is("profile_id", null)
    .ilike("display_name", escaped)
    .limit(5);

  if (error || !data) return [];

  return data.map((r) => ({
    id: r.id as string,
    displayName: r.display_name as string,
    familyBranch: (r.family_branch as string | null) ?? null,
    lifespan: lifespan({
      id: r.id as string,
      displayName: r.display_name as string,
      givenName: null,
      familyName: null,
      birthDate: (r.birth_date as string | null) ?? null,
      birthCirca: (r.birth_circa as string | null) ?? null,
      deathDate: (r.death_date as string | null) ?? null,
      deathCirca: (r.death_circa as string | null) ?? null,
      familyBranch: (r.family_branch as string | null) ?? null,
      profileId: null,
    }),
  }));
}

/**
 * Place the member in the tree and record their generation.
 *
 * The writes (own person row, any inline stubs, the parent/spouse edges) all
 * happen inside `place_self_in_tree`, a SECURITY INVOKER function, so they
 * succeed or fail together. A half-applied save here would strand a parent stub
 * with no edge, and the retry would create a second stub for the same person.
 *
 * Revisions are written afterward and best-effort, matching the rest of the
 * tree write path: the audit trail must never be able to undo the placement.
 */
export async function savePlacement(
  _prev: WelcomeFormState,
  formData: FormData,
): Promise<WelcomeFormState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { status: "error", message: "You're not signed in." };
  }

  const generationRaw = readText(formData, "generation");
  if (!generationRaw) {
    return { status: "error", message: "Please choose your generation." };
  }
  let generation: number;
  try {
    generation = parseGeneration(generationRaw)!;
  } catch (e) {
    return {
      status: "error",
      message: e instanceof Error ? e.message : "Invalid generation.",
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, family_branch")
    .eq("id", user.id)
    .single();

  const displayName = (profile?.full_name as string | null)?.trim() ?? "";
  if (!displayName) {
    return { status: "error", message: "Please add your name first." };
  }

  const parentIds = readIds(formData, "parent_person");
  const parentNames = readNames(formData, "parent_name");
  const spouseId = readIds(formData, "spouse_person")[0] ?? null;
  const spouseName = readNames(formData, "spouse_name")[0] ?? null;
  const claimId = readText(formData, "claim_person_id");

  // Tree first: it's the write that can fail in interesting ways, and it's
  // idempotent on retry. Stamping the generation before it would leave the
  // profile claiming a placement that never happened.
  const { data: result, error } = await supabase.rpc("place_self_in_tree", {
    p_claim_person_id: claimId,
    p_display_name: displayName,
    p_family_branch: (profile?.family_branch as string | null) ?? null,
    p_parent_ids: parentIds,
    p_parent_names: parentNames,
    p_spouse_id: spouseId,
    p_spouse_name: spouseName,
  });

  if (error) {
    return { status: "error", message: friendlyPlacementError(error.message) };
  }

  const { error: genError } = await supabase
    .from("profiles")
    .update({ generation })
    .eq("id", user.id);
  if (genError) return { status: "error", message: genError.message };

  await recordPlacementRevisions(result, user.id, displayName);

  revalidatePath("/family/tree");
  revalidatePath("/", "layout");
  return { status: "saved" };
}

/** Shape returned by `place_self_in_tree`. */
type PlacementResult = {
  person_id: string;
  claimed: boolean;
  created_people: string[] | null;
  created_edges:
    | { id: string; person_a: string; person_b: string; type: string }[]
    | null;
};

/**
 * Attribution for what the placement just wrote. `people` and `relationships`
 * carry no audit trigger, so the revision rows are the trail — the same
 * discipline the tree pages follow. Best-effort by design.
 */
async function recordPlacementRevisions(
  raw: unknown,
  userId: string,
  displayName: string,
): Promise<void> {
  const result = raw as PlacementResult | null;
  if (!result) return;

  if (result.claimed) {
    await recordRevision({
      entityType: "person",
      entityId: result.person_id,
      changedBy: userId,
      before: { profile_id: null },
      after: { profile_id: userId },
    });
  }

  for (const id of result.created_people ?? []) {
    await recordRevision({
      entityType: "person",
      entityId: id,
      changedBy: userId,
      before: {},
      after: {
        // The name is only known here for the member's own row; stubs are
        // recorded as created, with the tree page owning any later detail.
        display_name: id === result.person_id ? displayName : undefined,
        created_via: "onboarding",
      },
    });
  }

  for (const edge of result.created_edges ?? []) {
    await recordRevision({
      entityType: "relationship",
      entityId: edge.id,
      changedBy: userId,
      before: {},
      after: {
        person_a: edge.person_a,
        person_b: edge.person_b,
        type: edge.type,
        created_via: "onboarding",
      },
    });
  }
}

/** Turn the function's raise messages into something a family member can act on. */
function friendlyPlacementError(message: string): string {
  if (/already linked to another account/i.test(message)) {
    return "Someone has already claimed that person. Choose a different one, or continue as a new entry.";
  }
  if (/already recorded as your child/i.test(message)) {
    return "One of those people is already recorded as your child, so they can't also be your parent.";
  }
  if (/Guests cannot/i.test(message)) {
    return "Guest accounts aren't part of the family tree.";
  }
  if (/no longer exists/i.test(message)) {
    return "Someone you picked was just removed. Please pick again.";
  }
  return message;
}

// ---------------------------------------------------------------------------
// Step 3 — a face and a few words. Finishing is what opens the gate.
// ---------------------------------------------------------------------------
export async function finishOnboarding(
  _prev: WelcomeFormState,
  formData: FormData,
): Promise<WelcomeFormState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { status: "error", message: "You're not signed in." };
  }

  const bio = readText(formData, "bio");

  const { error } = await supabase
    .from("profiles")
    .update({ bio, onboarded_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return { status: "error", message: error.message };

  revalidatePath("/", "layout");
  redirect("/?welcome=1");
}

/**
 * "Finish Later" — let the member in without trapping them, but mark that
 * they've seen the flow so the gate doesn't bounce them back every login.
 * Writes nothing else: anything they hadn't pressed Save on stays unsaved, and
 * the dashboard nudge keeps naming what's still missing.
 */
export async function skipOnboarding(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect("/login");
  }

  await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", user.id)
    .is("onboarded_at", null);

  revalidatePath("/", "layout");
  redirect("/");
}

// ---------------------------------------------------------------------------
// Form helpers
// ---------------------------------------------------------------------------
function readText(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : null;
}

/** Every value under `key` that looks like a uuid (the pickers' hidden inputs). */
function readIds(formData: FormData, key: string): string[] {
  const seen = new Set<string>();
  for (const v of formData.getAll(key)) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)
    ) {
      seen.add(t);
    }
  }
  return [...seen];
}

/** Every non-empty typed name under `key` ("they're not listed" stubs). */
function readNames(formData: FormData, key: string): string[] {
  const out: string[] = [];
  for (const v of formData.getAll(key)) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t.length) out.push(t);
  }
  return out;
}
