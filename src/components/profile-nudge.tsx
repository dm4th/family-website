"use client";

import * as React from "react";
import Link from "next/link";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Soft follow-up for a member who chose "Finish later" in the guided flow and
 * still has a blank name or family (PRD 13, slice 1 — "keep nudging until name +
 * branch set"). Quiet, dismissible for the session, and never traps them.
 */
export function ProfileNudge() {
  const [dismissed, setDismissed] = React.useState(false);
  if (dismissed) return null;

  return (
    <div className="flex items-center gap-4 rounded-lg border border-accent-family/25 bg-accent-family-soft/40 px-4 py-3">
      <p className="flex-1 text-sm text-foreground">
        Your profile isn&apos;t finished yet.{" "}
        <Link
          href="/profile/edit"
          className="font-medium text-accent-family underline-offset-4 hover:underline"
        >
          Add your name and family
        </Link>{" "}
        so the rest of the family recognizes you.
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
