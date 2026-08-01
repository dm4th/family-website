"use client";

import * as React from "react";
import Link from "next/link";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/** What's still missing, most-worth-fixing first. */
export type ProfileGap = "identity" | "generation" | "tree";

/**
 * Soft follow-up for a member who chose "Finish Later" and hasn't come back
 * (PRD 13, extended by PRD 39).
 *
 * "Finished" now includes being in the family tree. The old rule checked only
 * that a name existed, so it declared victory while the member was still
 * invisible in the tree and, in the case we actually watched, still filed under
 * "Generation not set". Quiet, dismissible for the session, never a trap.
 */
export function ProfileNudge({ gap }: { gap: ProfileGap }) {
  const [dismissed, setDismissed] = React.useState(false);
  if (dismissed) return null;

  const { href, linkText, trailing } = COPY[gap];

  return (
    <div className="flex items-center gap-4 rounded-lg border border-accent-family/25 bg-accent-family-soft/40 px-4 py-3">
      <p className="flex-1 text-sm text-foreground">
        Your profile isn&apos;t finished yet.{" "}
        <Link
          href={href}
          className="font-medium text-accent-family underline-offset-4 hover:underline"
        >
          {linkText}
        </Link>{" "}
        {trailing}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="text-foreground-subtle hover:text-foreground"
      >
        <XIcon />
      </Button>
    </div>
  );
}

/** Name the one thing that's missing, rather than a generic "finish up". */
const COPY: Record<
  ProfileGap,
  { href: string; linkText: string; trailing: string }
> = {
  identity: {
    href: "/profile/edit",
    linkText: "Add your name and family",
    trailing: "so the rest of the family recognizes you.",
  },
  generation: {
    href: "/profile/edit",
    linkText: "Choose your generation",
    trailing: "so you're listed with the right people in the directory.",
  },
  tree: {
    href: "/welcome",
    linkText: "Add yourself to the family tree",
    trailing: "so you show up connected to the people you belong with.",
  },
};
