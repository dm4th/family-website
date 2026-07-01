"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { FeedbackStatus } from "@/lib/db/schema";

const STATUSES: FeedbackStatus[] = ["new", "seen", "planned", "done"];

/**
 * Advance a feedback item through the triage queue. Admin-only: the RLS update
 * policy already gates this to `is_admin()`, but we check up front so a
 * non-admin gets a clean error rather than a silent no-op.
 */
export async function updateFeedbackStatus(
  feedbackId: string,
  status: FeedbackStatus,
): Promise<void> {
  if (!STATUSES.includes(status)) {
    throw new Error("Invalid status");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Not signed in");

  const { data: adminCheck } = await supabase.rpc("is_admin");
  if (adminCheck !== true) throw new Error("Admin only");

  const { error } = await supabase
    .from("feedback")
    .update({
      status,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", feedbackId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/feedback");
}
