import { FeedbackButton } from "@/components/feedback/feedback-button";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-3 px-5 py-8 text-xs text-foreground-subtle sm:flex-row sm:items-center sm:px-8">
        <span className="eyebrow text-foreground-subtle">
          Mathieson Family · Private
        </span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Reachable from every page — including the stripped guest shell,
              since guests may send feedback too (PRD 20). */}
          <FeedbackButton />
          <span className="text-foreground-subtle">
            For family use only. Not for distribution.
          </span>
        </div>
      </div>
    </footer>
  );
}
