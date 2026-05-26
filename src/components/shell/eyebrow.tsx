import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Eyebrow — small uppercase bronze label used above section titles, inside
 * panels, beside metadata. The most-reused editorial signal.
 */

type EyebrowProps = React.ComponentProps<"p"> & {
  tone?: "bronze" | "muted";
};

function Eyebrow({ tone = "bronze", className, ...props }: EyebrowProps) {
  return (
    <p
      data-slot="eyebrow"
      data-tone={tone}
      className={cn(
        "eyebrow",
        tone === "bronze" ? "text-accent-bronze" : "text-foreground-subtle",
        className
      )}
      {...props}
    />
  );
}

export { Eyebrow };
