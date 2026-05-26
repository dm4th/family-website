import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * SectionRule — a hairline divider with an optional centered ornament,
 * used to break a page into editorial "chapters". Default is a simple
 * hairline; with `ornament` it shows a small bronze diamond.
 */

type SectionRuleProps = {
  className?: string;
  ornament?: boolean;
  label?: React.ReactNode;
};

function SectionRule({ className, ornament, label }: SectionRuleProps) {
  if (label) {
    return (
      <div
        data-slot="section-rule"
        data-variant="label"
        className={cn(
          "flex items-center gap-4 text-foreground-subtle",
          className
        )}
      >
        <span className="h-px flex-1 bg-border" aria-hidden />
        <span className="eyebrow text-accent-bronze">{label}</span>
        <span className="h-px flex-1 bg-border" aria-hidden />
      </div>
    );
  }

  if (ornament) {
    return (
      <div
        data-slot="section-rule"
        data-variant="ornament"
        className={cn("flex items-center gap-4", className)}
        aria-hidden
      >
        <span className="h-px flex-1 bg-border" />
        <span className="size-1.5 rotate-45 bg-accent-bronze/60" />
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  }

  return (
    <hr
      data-slot="section-rule"
      data-variant="plain"
      className={cn("section-rule border-0", className)}
    />
  );
}

export { SectionRule };
