import { renderEmailHtml, renderEmailText } from "@/lib/email/layout";
import type { RenderedEmail } from "@/lib/email/booking-emails";

/** The facts an invitation email needs (PRD 39, slice A). */
export type InvitationEmailContext = {
  /** The address the invitation is bound to. Must be entered verbatim to get in. */
  invitedEmail: string;
  /** Display name of the person who sent it. Falls back to "A family member". */
  inviterName: string;
  /** Absolute URL of the sign-in page, with the invited address prefilled. */
  acceptUrl: string;
  /** True for a guest invite — scoped to one property, no tree, warmer-but-briefer. */
  isGuest: boolean;
  /** Property name for a guest invite, when known. */
  propertyName?: string | null;
};

/**
 * The email that actually invites someone in.
 *
 * This is the site's first impression and the single highest-leverage point
 * against abandonment, so it pre-empts the two failure modes we have actually
 * watched happen:
 *
 *  1. Signing in with a different address than the one invited. The invitation
 *     is email-bound (PRD 24: `handle_new_user()` rejects uninvited signups),
 *     so a mismatch reads to the recipient as "the site rejected me". The
 *     address is therefore stated twice: as a numbered instruction and as its
 *     own line they can compare against.
 *  2. Expecting a password. There isn't one, and a sign-in page that only asks
 *     for an email looks broken if you weren't told. So we say plainly that a
 *     link is coming and that the link IS the way in.
 *
 * Family mode (burgundy CTA): joining the family site is a family matter, not
 * a logistics one. Copy conventions per CLAUDE.md — sentence-case subject,
 * Title Case CTA, no em-dashes.
 */
export function invitationEmail(ctx: InvitationEmailContext): RenderedEmail {
  const inviter = ctx.inviterName.trim() || "A family member";

  const subject = "You're invited to the Mathieson family site";

  const heading = `${inviter} invited you in.`;

  // What the site IS, in one warm sentence. Guests get a narrower promise
  // because that is genuinely all they can see (PRD 15 scopes them to one
  // property); overselling it would be the wrong kind of welcome.
  const whatItIs = ctx.isGuest
    ? ctx.propertyName
      ? `It's the family's private site. You'll have access to ${ctx.propertyName}: the details for your stay, how things work, and who to call.`
      : "It's the family's private site, where you'll find the details for your stay, how things work, and who to call."
    : "It's the family's private site: where we keep up with each other, share photos and stories, and look after our homes together.";

  const paragraphs = [
    `${inviter} added you to the Mathieson family site.`,
    whatItIs,
    "Getting in takes about a minute:",
    "1. Press the button below.",
    `2. Enter this same email address: ${ctx.invitedEmail}`,
    "3. We'll email you a sign-in link. Open it, and you're in.",
    "There's no password to make up or remember. The link we send is how you sign in, every time.",
  ];

  const content = {
    preview: `${inviter} invited you to the Mathieson family site`,
    heading,
    paragraphs,
    details: [{ label: "Your email", value: ctx.invitedEmail }],
    cta: { label: "Accept Your Invitation", url: ctx.acceptUrl },
    mode: "family" as const,
    footer:
      "You're receiving this because someone in the Mathieson family invited you. If you weren't expecting it, you can ignore this email and nothing will happen.",
  };

  return {
    subject,
    html: renderEmailHtml(content),
    text: renderEmailText(content),
  };
}
