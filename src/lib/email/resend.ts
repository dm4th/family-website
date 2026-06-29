import { Resend } from "resend";

/**
 * Thin, best-effort email layer over Resend.
 *
 * Design constraints for this project:
 * - Email is OPTIONAL infrastructure. Local dev, preview builds, and any
 *   environment without `RESEND_API_KEY` set must keep working — so when the
 *   key is absent we no-op (and log) instead of throwing.
 * - Sending is never allowed to break the action that triggered it. Callers
 *   treat notifications as side effects; `sendEmail()` swallows transport
 *   errors and reports them in its return value rather than raising.
 */

/** Result of an attempted send — discriminated so callers can log meaningfully. */
export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; skipped: true } // no API key configured
  | { ok: false; skipped: false; error: string };

let cachedClient: Resend | null | undefined;

/**
 * Lazily construct (and memoize) the Resend client. Returns null when
 * `RESEND_API_KEY` is unset so the rest of the layer can gracefully no-op.
 */
function getResend(): Resend | null {
  if (cachedClient !== undefined) return cachedClient;
  const key = process.env.RESEND_API_KEY;
  cachedClient = key ? new Resend(key) : null;
  return cachedClient;
}

/**
 * The verified "from" address. Configured via `RESEND_FROM_EMAIL`
 * (e.g. `Mathieson Family <notifications@mathiesonfamily.app>`); falls back to
 * Resend's onboarding sandbox sender, which only delivers to the account
 * owner's own address — fine for first-run testing before the domain is
 * verified.
 */
function getFromAddress(): string {
  return (
    process.env.RESEND_FROM_EMAIL ?? "Mathieson Family <onboarding@resend.dev>"
  );
}

export type SendEmailInput = {
  /** One or more recipient addresses. Empty array → treated as a no-op skip. */
  to: string[];
  subject: string;
  html: string;
  /** Plaintext fallback for clients that don't render HTML. */
  text: string;
  /** Optional Reply-To, e.g. so a member can reply to the requester. */
  replyTo?: string;
};

/**
 * Send one email, best-effort. Never throws — returns a discriminated result
 * the caller can log. When no API key is configured or there are no
 * recipients, returns `{ ok: false, skipped: true }`.
 */
export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const recipients = input.to.filter((address) => address.trim().length > 0);
  if (recipients.length === 0) {
    return { ok: false, skipped: true };
  }

  const resend = getResend();
  if (!resend) {
    // No key in this environment — log so it's visible in dev that an email
    // *would* have gone out, then carry on.
    console.info(
      `[email] RESEND_API_KEY unset — skipping "${input.subject}" to ${recipients.length} recipient(s)`,
    );
    return { ok: false, skipped: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: getFromAddress(),
      to: recipients,
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    });
    if (error) {
      console.error(`[email] send failed: ${error.message ?? String(error)}`);
      return { ok: false, skipped: false, error: error.message ?? "unknown" };
    }
    return { ok: true, id: data?.id ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[email] send threw: ${message}`);
    return { ok: false, skipped: false, error: message };
  }
}
