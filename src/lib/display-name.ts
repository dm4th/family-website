/**
 * Never render "Unnamed" (PRD 13). A member who hasn't set their name yet
 * should still read as a person, not a dead label.
 *
 *   displayName("Jane Doe", …)        → "Jane Doe"
 *   displayName(null, "jdoe@x.com")   → "Jdoe"        (first chunk of the email)
 *   displayName(null, null)           → "Member"      (last-resort neutral)
 *
 * For the signed-in member looking at *their own* empty profile, prefer an
 * "Add your name" call to action at the call site instead of this fallback.
 */
export function displayName(
  fullName: string | null | undefined,
  email?: string | null,
): string {
  const name = fullName?.trim();
  if (name) return name;

  const fromEmail = firstNameFromEmail(email);
  if (fromEmail) return fromEmail;

  return "Member";
}

/** Best-effort human-ish first name from the local part of an email. */
export function firstNameFromEmail(
  email: string | null | undefined,
): string | null {
  const local = email?.split("@")[0]?.trim();
  if (!local) return null;
  // Split on common separators, take the first chunk, Title-case it.
  const first = local.split(/[._+-]+/).filter(Boolean)[0];
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}
