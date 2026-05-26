import * as React from "react";

import { cn } from "@/lib/utils";

type PageMode = "family" | "operations" | "advisory";

/**
 * PageIntro — the editorial top of every interior page.
 *
 * It sets the page mode (which determines accent + tone), states the title
 * in Fraunces, and optionally pairs an eyebrow, a one-line context, and a
 * single primary action. One primary action per page, max.
 *
 * Example:
 *   <PageIntro
 *     mode="operations"
 *     eyebrow="Property"
 *     title="The Cabin at Mathieson Creek"
 *     context="Boone, North Carolina · Active"
 *     action={<Button>Edit details</Button>}
 *   />
 */

const modeRailColor: Record<PageMode, string> = {
  family: "bg-accent-family",
  operations: "bg-accent-operations",
  advisory: "bg-accent-advisory",
};

type PageIntroProps = {
  mode?: PageMode;
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  context?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  /** Render the eyebrow as a small mode rail rather than text. */
  showRail?: boolean;
};

function PageIntro({
  mode,
  eyebrow,
  title,
  context,
  action,
  className,
  showRail = true,
}: PageIntroProps) {
  return (
    <header
      data-slot="page-intro"
      data-mode={mode}
      className={cn(
        "flex flex-col gap-5 pb-8 sm:flex-row sm:items-end sm:justify-between sm:gap-10 sm:pb-10",
        className
      )}
    >
      <div className="flex max-w-3xl flex-col gap-3">
        {(eyebrow || (showRail && mode)) && (
          <div className="flex items-center gap-3">
            {showRail && mode && (
              <span
                aria-hidden
                className={cn("h-px w-8", modeRailColor[mode])}
              />
            )}
            {eyebrow && (
              <p className="eyebrow text-accent-bronze">{eyebrow}</p>
            )}
          </div>
        )}
        <h1 className="font-display text-[2rem] leading-[1.05] text-foreground sm:text-[2.5rem]">
          {title}
        </h1>
        {context && (
          <p className="text-sm leading-relaxed text-foreground-muted sm:text-[0.95rem]">
            {context}
          </p>
        )}
      </div>
      {action && (
        <div className="flex shrink-0 items-center gap-2">{action}</div>
      )}
    </header>
  );
}

export { PageIntro };
export type { PageMode };
