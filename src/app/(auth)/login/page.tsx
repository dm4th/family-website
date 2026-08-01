import { BriefingPanel, Eyebrow } from "@/components/shell";
import { LoginForm } from "./login-form";

type SearchParams = Promise<{ error?: string; email?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error, email } = await searchParams;

  // Invitation emails link here with ?email= so the one address that works is
  // already typed (PRD 39). It prefills, never locks: people forward email, and
  // the wrong-address fumble is only worth fixing if the fix is escapable.
  const invitedEmail = typeof email === "string" ? email.trim() : "";

  return (
    <BriefingPanel className="bg-surface-raised">
      {/* Someone arriving from an invitation has never been here before, so
          "Welcome back" is the wrong greeting and "sign in" understates what
          happens next. Same form either way, honest framing for both. */}
      <header className="mb-8 flex flex-col gap-2">
        <Eyebrow>{invitedEmail ? "You're invited" : "Members entrance"}</Eyebrow>
        <h1 className="font-display text-[1.875rem] leading-[1.05] text-foreground">
          {invitedEmail ? "Let's get you in." : "Welcome back."}
        </h1>
        <p className="text-sm leading-relaxed text-foreground-muted">
          {invitedEmail
            ? "Your email address is filled in below. Send yourself a sign-in link and open it, and you're in. There's no password to make up."
            : "Sign in with the email address that received your invitation."}
        </p>
      </header>
      <LoginForm initialError={error} defaultEmail={invitedEmail} />
    </BriefingPanel>
  );
}
