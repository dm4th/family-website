"use client";

/**
 * "2 of 4 updates saved" (PRD 34).
 *
 * A review session hands the member several independent things to save, each
 * with its own button, and after two or three saves the page has scrolled and
 * the finished sections have collapsed into confirmations. Without a count there
 * is no way to answer "have I dealt with all of it?" except scrolling back
 * through everything.
 *
 * It counts and nothing more. Ordering is not forced, nothing is greyed out, and
 * leaving updates unsaved is a perfectly good outcome — a member who wanted one
 * phone number out of a long note is finished at 1 of 5. So the copy never says
 * "remaining", and there is no completion state to chase.
 */

export function SaveProgress({ saved, total }: { saved: number; total: number }) {
  if (total === 0) return null;

  return (
    <p
      className="text-sm text-foreground-subtle"
      // Announced so the count reaching a screen reader doesn't depend on
      // wandering back up the page (PRD 30).
      aria-live="polite"
    >
      {saved === 0
        ? `${total} ${total === 1 ? "update" : "updates"} to look through. Take what you want and ignore the rest.`
        : `${saved} of ${total} ${total === 1 ? "update" : "updates"} saved.`}
    </p>
  );
}
