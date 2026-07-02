import type { Metadata } from "next";

import { BriefingPanel, Eyebrow } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/sign-out/actions";

export const metadata: Metadata = {
  title: "Account Inactive",
};

/**
 * Where a deactivated (but still-authenticated) user lands (PRD 26). The
 * middleware redirects any signed-in user whose profile is deactivated here;
 * RLS is the real guarantee (their session can read/write nothing). Calm and
 * human, not a raw error. Public route (allowlisted in the auth middleware) so
 * the redirect can't loop and the sign-out form (a server action posting to
 * this path) is not itself gated.
 */
export default function DeactivatedPage() {
  return (
    <BriefingPanel className="bg-surface-raised">
      <header className="mb-6 flex flex-col gap-2">
        <Eyebrow>Account inactive</Eyebrow>
        <h1 className="font-display text-[1.875rem] leading-[1.05] text-foreground">
          Your access is paused.
        </h1>
        <p className="text-sm leading-relaxed text-foreground-muted">
          This account is currently inactive, so you&rsquo;re signed out of the
          family portal. If you think this is a mistake, please reach out to a
          family administrator and they can restore your access.
        </p>
      </header>
      <form action={signOut}>
        <Button type="submit" variant="outline">
          Sign Out
        </Button>
      </form>
    </BriefingPanel>
  );
}
