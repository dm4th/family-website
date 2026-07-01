import type { SupabaseClient } from "@supabase/supabase-js";

import { sendEmail } from "@/lib/email/resend";
import {
  feedbackSubmittedEmail,
  type FeedbackEmailContext,
} from "@/lib/email/feedback-email";
import { getSiteOrigin } from "@/lib/ics";
import type { FeedbackCategory } from "@/lib/db/schema";

/**
 * Best-effort feedback notification. Mirrors the booking notifier's posture
 * (see src/lib/notifications/bookings.ts): runs AFTER the feedback row has
 * committed, resolves admin recipients under the acting user's session, and
 * swallows any failure — a notification problem must never surface an error on
 * the submission itself.
 *
 * Recipients are the site admins (`profiles.role = 'admin'`). `profiles` is
 * "authenticated read all", so this works for a member submitter. GUEST
 * submitters, however, have restricted profile visibility (PRD 15) and may read
 * zero admin emails — in which case this quietly sends nothing. That's the
 * accepted trade-off for now: the row is always the durable record (the admin
 * queue shows it regardless), and the email is a convenience layer. The
 * designated escape hatch, if guest submissions must always email, is a
 * `SECURITY DEFINER admin_notification_emails()` function (same pattern the
 * booking notifier documents).
 */

type Client = SupabaseClient;

export type FeedbackNotificationInput = {
  category: FeedbackCategory;
  message: string;
  pageUrl: string | null;
  submittedBy: string;
};

/** Site-admin email addresses, deduped and non-empty, minus the submitter. */
async function loadAdminEmails(
  supabase: Client,
  excludeProfileId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("role", "admin");

  const byEmail = new Map<string, string>(); // lower-cased → original
  for (const row of data ?? []) {
    if (row.id === excludeProfileId) continue;
    const email = (row.email as string | null)?.trim();
    if (email) byEmail.set(email.toLowerCase(), email);
  }
  return [...byEmail.values()];
}

/** One profile's display name (falls back to a generic label). */
async function loadSubmitterName(
  supabase: Client,
  profileId: string,
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", profileId)
    .maybeSingle();
  return (data?.full_name as string | null)?.trim() || "A family member";
}

/** New feedback landed → alert the admins so nothing is lost. */
export async function notifyFeedbackSubmitted(
  supabase: Client,
  input: FeedbackNotificationInput,
): Promise<void> {
  try {
    const [admins, submitterName] = await Promise.all([
      loadAdminEmails(supabase, input.submittedBy),
      loadSubmitterName(supabase, input.submittedBy),
    ]);
    if (admins.length === 0) return;

    const origin = await getSiteOrigin();
    const ctx: FeedbackEmailContext = {
      category: input.category,
      message: input.message,
      pageUrl: input.pageUrl,
      submitterName,
      triageUrl: `${origin}/admin/feedback`,
    };
    const email = feedbackSubmittedEmail(ctx);
    await sendEmail({
      to: admins,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  } catch (err) {
    console.error("[notify] feedback-submitted failed:", err);
  }
}
