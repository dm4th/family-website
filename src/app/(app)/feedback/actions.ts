"use server";

import { createClient } from "@/lib/supabase/server";
import { notifyFeedbackSubmitted } from "@/lib/notifications/feedback";
import type { FeedbackCategory } from "@/lib/db/schema";

const CATEGORIES: FeedbackCategory[] = ["idea", "problem", "other"];
const MAX_MESSAGE = 2000;

export type FeedbackFormState =
  | { status: "idle" }
  | { status: "sent" }
  | { status: "error"; message: string };

function readText(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/**
 * Submit a feedback note. Any signed-in user — member OR guest — may call this
 * (the RLS insert policy deliberately omits the `not is_guest()` gate). We write
 * the row with `created_by = auth.uid()`, then fire a best-effort admin email
 * whose failure can never fail the submission.
 */
export async function submitFeedback(
  _prev: FeedbackFormState,
  formData: FormData,
): Promise<FeedbackFormState> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { status: "error", message: "Please sign in to send feedback." };
    }

    const categoryRaw = readText(formData, "category") ?? "idea";
    const category = (
      CATEGORIES.includes(categoryRaw as FeedbackCategory)
        ? categoryRaw
        : "idea"
    ) as FeedbackCategory;

    const message = readText(formData, "message");
    if (!message) {
      return { status: "error", message: "Please write a short message." };
    }
    if (message.length > MAX_MESSAGE) {
      return {
        status: "error",
        message: "That's a bit long. Please keep it under 2000 characters.",
      };
    }

    // Auto-captured on the client from the page they were on. Optional.
    const pageUrl = readText(formData, "page_url");

    const { error } = await supabase.from("feedback").insert({
      category,
      message,
      page_url: pageUrl,
      created_by: user.id,
    });
    if (error) return { status: "error", message: error.message };

    // Best-effort: alert admins. Never let a mail failure fail the submission.
    await notifyFeedbackSubmitted(supabase, {
      category,
      message,
      pageUrl,
      submittedBy: user.id,
    });

    return { status: "sent" };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
