"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { resetIcsToken } from "@/app/(app)/profile/actions";
import type { IcsFeedLinks } from "@/lib/ics";

/**
 * Calendar-subscription affordances for one feed scope. Renders an "Add to
 * Google Calendar" deep link, a webcal:// link (Apple/Outlook), a copyable
 * URL, and a "reset link" control that rotates the token and refreshes the
 * page so the new URL shows.
 *
 * The feed URL embeds the member's secret token, so it's shown only to the
 * owner. `links` is recomputed server-side after a reset via router.refresh().
 */
export function SubscribeToCalendar({
  links,
  blurb,
}: {
  links: IcsFeedLinks;
  blurb?: string;
}) {
  const router = useRouter();
  const [copied, setCopied] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);
  const [confirmingReset, setConfirmingReset] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(links.https);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the input is selectable as a fallback.
    }
  }

  async function doReset() {
    setResetting(true);
    try {
      await resetIcsToken();
      setConfirmingReset(false);
      router.refresh();
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-foreground-subtle">
        {blurb ??
          "Subscribe once and approved bookings keep flowing into your calendar. Calendar apps refresh every few hours — new bookings aren't instant."}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <a href={links.google} target="_blank" rel="noopener noreferrer">
            Add to Google Calendar
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={links.webcal}>Apple / Outlook</a>
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="eyebrow text-foreground-subtle">Feed URL</label>
        <div className="flex gap-2">
          <input
            readOnly
            value={links.https}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-md border border-border bg-surface-sunken px-3 py-1.5 font-mono text-xs text-foreground-muted"
          />
          <Button variant="outline" size="sm" onClick={copy} type="button">
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="text-xs text-foreground-subtle">
          Paste into any calendar app&apos;s &ldquo;subscribe from URL&rdquo;
          field. Treat it like a password — anyone with the link can see these
          bookings.
        </p>
      </div>

      <div className="border-t border-border pt-3">
        {confirmingReset ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-foreground-muted">
              Reset the link? Existing subscriptions will stop updating.
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={doReset}
              disabled={resetting}
              type="button"
            >
              {resetting ? "Resetting…" : "Reset link"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingReset(false)}
              disabled={resetting}
              type="button"
            >
              Cancel
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingReset(true)}
            className="text-xs text-foreground-subtle underline-offset-4 hover:text-foreground hover:underline"
          >
            Reset my calendar link
          </button>
        )}
      </div>
    </div>
  );
}
