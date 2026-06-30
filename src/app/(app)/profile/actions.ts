"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseGeneration } from "@/lib/generations";

export type ProfileFormState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; message: string };

export async function updateOwnProfile(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { status: "error", message: "Not signed in" };
  }

  // A guest's profile is contact basics only (PRD 15-R2). Even if a guest were
  // to reach this member action, drop the family-only fields here so it can
  // never write Family Branch / Generation / notes / Bio. The dedicated guest
  // editor (updateGuestProfile) is the normal path; this is belt-and-braces.
  const { data: guestCheck } = await supabase.rpc("is_guest");
  if (guestCheck === true) {
    return saveContactBasics(supabase, user.id, formData);
  }

  const fullName = readText(formData, "full_name");
  const familyBranch = readText(formData, "family_branch");
  const generationRaw = readText(formData, "generation");
  const relationshipNotes = readText(formData, "relationship_notes");
  const phone = readText(formData, "phone");
  const bio = readText(formData, "bio");

  let generation: number | null;
  try {
    generation = parseGeneration(generationRaw);
  } catch (e) {
    return {
      status: "error",
      message: e instanceof Error ? e.message : "Invalid generation.",
    };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      family_branch: familyBranch,
      generation,
      relationship_notes: relationshipNotes,
      phone,
      bio,
    })
    .eq("id", user.id);

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/family");
  revalidatePath(`/family/${user.id}`);
  revalidatePath("/profile/edit");
  return { status: "saved" };
}

/**
 * Guest profile save (PRD 15-R2). A guest is a property renter, not a family
 * member: their editor collects contact basics only (name, phone; photo writes
 * itself). This never touches Family Branch / Generation / relationship notes /
 * Bio, so a guest can't populate family-tree fields they don't belong in.
 */
export async function updateGuestProfile(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { status: "error", message: "Not signed in" };
  }

  return saveContactBasics(supabase, user.id, formData);
}

/**
 * Persist only the contact basics (name + phone) for a profile. Shared by the
 * guest editor and the guest guard in updateOwnProfile.
 */
async function saveContactBasics(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  formData: FormData,
): Promise<ProfileFormState> {
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: readText(formData, "full_name"),
      phone: readText(formData, "phone"),
    })
    .eq("id", userId);

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/profile/edit");
  return { status: "saved" };
}

/**
 * Rotate the caller's calendar-feed token, invalidating any previously shared
 * subscription URL. The RLS "profiles: self update" policy permits this; the
 * privileged-column guard only blocks role / deactivated_at, not ics_token.
 */
export async function resetIcsToken(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error("Not signed in");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ ics_token: crypto.randomUUID() })
    .eq("id", user.id);
  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/calendar");
}

export async function setAvatarFromPhoto(photoId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error("Not signed in");
  }

  const { data: photo, error: photoErr } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("id", photoId)
    .single();

  if (photoErr || !photo) {
    throw new Error("Photo not found");
  }

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ avatar_url: photo.storage_path })
    .eq("id", user.id);

  if (updateErr) {
    throw new Error(updateErr.message);
  }

  revalidatePath("/family");
  revalidatePath(`/family/${user.id}`);
  revalidatePath("/profile/edit");
}

function readText(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : null;
}
