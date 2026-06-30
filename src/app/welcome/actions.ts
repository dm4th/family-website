"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { parseGeneration } from "@/lib/generations";

export type WelcomeFormState =
  | { status: "idle" }
  | { status: "error"; message: string };

/**
 * Finish the guided first-run flow (PRD 13, slice 1). Name + family branch are
 * required — that's what kills the "Unnamed" directory; photo and bio are
 * encouraged but optional and handled separately (photo via the inline
 * uploader, which writes immediately). Stamps onboarded_at so the redirect gate
 * lets them into the app, then drops them on the dashboard with a brief welcome
 * (?welcome=1).
 */
export async function completeOnboarding(
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
  const generationRaw = readText(formData, "generation");
  const phone = readText(formData, "phone");
  const relationshipNotes = readText(formData, "relationship_notes");
  const bio = readText(formData, "bio");

  if (!fullName) {
    return { status: "error", message: "Please add your name." };
  }
  if (!familyBranch) {
    return { status: "error", message: "Please choose your family." };
  }
  // Generation is required: it's what stops a new member landing under
  // "Generation not set" in the Directory (PRD 13, slice 13-R2).
  if (!generationRaw) {
    return { status: "error", message: "Please choose your generation." };
  }

  let generation: number;
  try {
    // Required here, so the blank-returns-null branch can't fire.
    generation = parseGeneration(generationRaw)!;
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
      phone,
      relationship_notes: relationshipNotes,
      bio,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/?welcome=1");
}

/**
 * "Finish later" — let the member into the app without trapping them, but mark
 * that they've seen the flow so the redirect gate doesn't bounce them back here
 * every login. The dashboard keeps a soft nudge until name + branch are set.
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

function readText(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : null;
}
