"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SalonPanel, PanelEyebrow } from "@/components/shell";

/**
 * Post-onboarding welcome — the celebratory landing a family member sees right
 * after finishing the guided /welcome flow (the dashboard renders it when
 * ?welcome=1; see PRD 13, slice 4). Family-mode SalonPanel: warm, short.
 *
 * It points at the four things that matter — find people, look after a place,
 * book a stay, add a photo — plus the always-available /help guide. onboarded_at
 * is already stamped by the flow, so dismissing is purely cosmetic: hide it and
 * strip the ?welcome=1 marker so a refresh doesn't bring it back.
 */

type Starter = {
  label: string;
  blurb: string;
  href: string;
};

const STARTERS: Starter[] = [
  {
    label: "Find people",
    blurb: "Everyone in the family, with photos and how they're related.",
    href: "/family",
  },
  {
    label: "Look after a place",
    blurb: "House notes, contacts and to-knows for our shared homes.",
    href: "/properties",
  },
  {
    label: "Book a stay",
    blurb: "Reserve dates and see who's where — no double-bookings.",
    href: "/calendar",
  },
  {
    label: "Add a photo",
    blurb: "Put a face to your name and share pictures.",
    href: "/profile/edit",
  },
];

export function WelcomePanel({ firstName }: { firstName: string }) {
  const [dismissed, setDismissed] = React.useState(false);
  const router = useRouter();

  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    // Drop the ?welcome=1 marker so reloading the dashboard doesn't re-show it.
    router.replace("/", { scroll: false });
  }

  return (
    <SalonPanel
      aria-labelledby="welcome-heading"
      className="border-accent-family/25"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={dismiss}
        aria-label="Dismiss welcome"
        className="absolute right-4 top-4 text-foreground-subtle hover:text-foreground"
      >
        <XIcon />
      </Button>

      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-2 pr-8">
          <PanelEyebrow className="text-accent-family">
            Welcome, {firstName}
          </PanelEyebrow>
          <h2
            id="welcome-heading"
            className="font-display text-[1.75rem] leading-[1.1] text-foreground sm:text-[2rem]"
          >
            A quiet place for the family.
          </h2>
          <p className="max-w-prose text-sm leading-relaxed text-foreground-muted">
            This is where we keep up with each other, look after the places we
            share, and plan our time at them. Here&apos;s where to start — and
            you can come back to the{" "}
            <Link
              href="/help"
              className="text-foreground underline underline-offset-4"
            >
              quick guide
            </Link>{" "}
            any time.
          </p>
        </header>

        <ul className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
          {STARTERS.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="group flex flex-col gap-1 border-l-2 border-border pl-4 transition-colors hover:border-accent-family"
              >
                <span className="text-base text-foreground transition-colors group-hover:text-accent-family">
                  {s.label}
                </span>
                <span className="text-xs leading-relaxed text-foreground-subtle">
                  {s.blurb}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-4">
          <Button
            type="button"
            onClick={dismiss}
            className={cn(
              "bg-accent-family text-accent-family-foreground hover:bg-accent-family/90"
            )}
          >
            Got it
          </Button>
          <Link
            href="/help"
            className="text-sm text-foreground-muted underline-offset-4 hover:text-foreground hover:underline"
          >
            Read the quick guide
          </Link>
        </div>
      </div>
    </SalonPanel>
  );
}
