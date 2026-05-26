import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium tracking-wide whitespace-nowrap transition-colors [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Quiet neutral pill — the default. Subdued, not candy-colored.
        neutral:
          "border-border bg-surface text-foreground-muted",
        // Mode pills — pulled from the page mode tokens.
        family:
          "border-accent-family/25 bg-accent-family-soft text-accent-family",
        operations:
          "border-accent-operations/25 bg-accent-operations-soft text-accent-operations",
        advisory:
          "border-accent-advisory/25 bg-accent-advisory-soft text-accent-advisory",
        // Status pills — used sparingly. Eyebrow-styled.
        status:
          "border-transparent bg-foreground/85 text-background uppercase tracking-[0.18em] text-[0.625rem]",
        outline:
          "border-border-strong bg-transparent text-foreground-muted",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      data-variant={variant ?? "neutral"}
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
