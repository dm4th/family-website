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
 *
 * Extra recipients: `FEEDBACK_EXTRA_RECIPIENTS` (server-only, comma-separated)
 * adds fixed addresses, e.g. Claude's intake inbox, which triages problem
 * reports into `bugs/`. These come from env rather than `profiles`, so guest
 * submissions reach them too. Reply-To is the submitter's session email (see
 * `loadSubmitter`), so any recipient can answer them directly.
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

/** Fixed extra recipients from `FEEDBACK_EXTRA_RECIPIENTS` (comma-separated). */
export function extraFeedbackRecipients(
  raw: string | undefined = process.env.FEEDBACK_EXTRA_RECIPIENTS,
): string[] {
  return (raw ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter((address) => address.includes("@"));
}

/** Merge address lists, deduped case-insensitively, keeping first spelling. */
function mergeRecipients(...lists: string[][]): string[] {
  const byEmail = new Map<string, string>();
  for (const address of lists.flat()) {
    const key = address.toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, address);
  }
  return [...byEmail.values()];
}

/**
 * The submitter's display name (generic fallback) and email.
 *
 * The email comes from the verified auth session, NOT `profiles.email`. Users
 * can edit their own profile row (only `role`/`deactivated_at` are guarded),
 * so a profile email could be set to another family member's address. The
 * intake inbox trusts Reply-To as the reporter's identity, so it must be the
 * session's own address. Null if the session doesn't match the submitter.
 */
async function loadSubmitter(
  supabase: Client,
  profileId: string,
): Promise<{ name: string; email: string | null }> {
  const [{ data }, { data: auth }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", profileId).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const sessionUser = auth?.user;
  return {
    name: (data?.full_name as string | null)?.trim() || "A family member",
    email:
      sessionUser && sessionUser.id === profileId
        ? sessionUser.email?.trim() || null
        : null,
  };
}

/** New feedback landed → alert the admins so nothing is lost. */
export async function notifyFeedbackSubmitted(
  supabase: Client,
  input: FeedbackNotificationInput,
): Promise<void> {
  try {
    const [admins, submitter] = await Promise.all([
      loadAdminEmails(supabase, input.submittedBy),
      loadSubmitter(supabase, input.submittedBy),
    ]);
    // Admins share one message; each extra recipient gets its own copy, so an
    // outside inbox (e.g. Claude's intake) never sees the admins' addresses.
    const adminKeys = new Set(admins.map((a) => a.toLowerCase()));
    const extras = mergeRecipients(extraFeedbackRecipients()).filter(
      (address) => !adminKeys.has(address.toLowerCase()),
    );
    if (admins.length === 0 && extras.length === 0) return;
    const submitterName = submitter.name;

    const origin = await getSiteOrigin();
    const ctx: FeedbackEmailContext = {
      category: input.category,
      message: input.message,
      pageUrl: input.pageUrl,
      submitterName,
      triageUrl: `${origin}/admin/feedback`,
    };
    const email = feedbackSubmittedEmail(ctx);
    const send = (to: string[]) =>
      sendEmail({
        to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        replyTo: submitter.email ?? undefined,
      });
    await Promise.all([
      admins.length > 0 ? send(admins) : null,
      ...extras.map((address) => send([address])),
    ]);
  } catch (err) {
    console.error("[notify] feedback-submitted failed:", err);
  }
}
