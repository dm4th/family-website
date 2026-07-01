import {
  renderEmailHtml,
  renderEmailText,
  type EmailDetail,
} from "@/lib/email/layout";
import type { RenderedEmail } from "@/lib/email/booking-emails";
import type { FeedbackCategory } from "@/lib/db/schema";

/** Human labels for the triage categories. */
const CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  idea: "Idea",
  problem: "Problem",
  other: "Other",
};

/** The facts an admin-notification email needs about a new submission. */
export type FeedbackEmailContext = {
  category: FeedbackCategory;
  message: string;
  /** The page the submitter was on, if captured. */
  pageUrl: string | null;
  /** Display name of the submitter (falls back to "A family member"). */
  submitterName: string;
  /** Absolute URL to the admin triage list. */
  triageUrl: string;
};

/**
 * To admins: a new suggestion or problem report just landed. Calm and
 * Advisory-toned — this is a memo to the stewards, not an alarm. The message
 * itself is the payload; the CTA opens the triage queue.
 */
export function feedbackSubmittedEmail(
  ctx: FeedbackEmailContext,
): RenderedEmail {
  const label = CATEGORY_LABEL[ctx.category];
  const heading = `New feedback: ${label.toLowerCase()}`;

  const details: EmailDetail[] = [
    { label: "Category", value: label },
    { label: "From", value: ctx.submitterName },
  ];
  if (ctx.pageUrl) details.push({ label: "Page", value: ctx.pageUrl });

  const content = {
    preview: `${ctx.submitterName} sent ${label.toLowerCase()} feedback`,
    heading,
    paragraphs: [
      `${ctx.submitterName} sent a note from the family portal:`,
      ctx.message,
      "It's saved to the feedback queue. Open the queue to triage it.",
    ],
    details,
    cta: { label: "Open Feedback", url: ctx.triageUrl },
  };

  return {
    subject: heading,
    html: renderEmailHtml(content),
    text: renderEmailText(content),
  };
}
