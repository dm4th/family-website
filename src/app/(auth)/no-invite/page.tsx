import Link from "next/link";
import type { Metadata } from "next";

import { BriefingPanel, Eyebrow } from "@/components/shell";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "By Invitation Only",
};

/**
 * Where an uninvited sign-in lands (PRD 24). The handle_new_user() trigger
 * rejects the signup, /auth/callback catches it and redirects here. Calm and
 * human, not a raw error. Public route (allowlisted in the auth middleware).
 */
export default function NoInvitePage() {
  return (
    <BriefingPanel className="bg-surface-raised">
      <header className="mb-6 flex flex-col gap-2">
        <Eyebrow>By invitation only</Eyebrow>
        <h1 className="font-display text-[1.875rem] leading-[1.05] text-foreground">
          You need an invitation.
        </h1>
        <p className="text-sm leading-relaxed text-foreground-muted">
          This site is private to our family. To join, ask a family member to
          send an invitation to this email address. Once they do, sign in again
          with the same address and you&rsquo;ll be let straight in.
        </p>
      </header>
      <Button asChild variant="outline">
        <Link href="/login">Back to Sign In</Link>
      </Button>
    </BriefingPanel>
  );
}
