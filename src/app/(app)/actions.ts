"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Mark the current member as welcomed — stamps profiles.onboarded_at so the
 * first-login welcome panel stays dismissed across reloads and devices (PRD 13).
 *
 * Idempotent and best-effort: if the write fails we don't surface an error to
 * the member (dismissing a welcome card is not worth a red toast); they'll just
 * see the panel again next load. The "profiles: self update" RLS policy permits
 * this, and the privileged-column guard only blocks role / deactivated_at.
 */
export async function dismissWelcome(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return;

  await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", user.id)
    .is("onboarded_at", null);

  revalidatePath("/");
}
