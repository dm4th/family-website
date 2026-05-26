import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Panel — the foundational container for the three page modes.
 *
 * Three flavours, never mixed casually:
 *
 *   - salon       Family content. Generous padding, soft radius, image-forward.
 *   - ledger      Operations content. Medium padding, stronger divider logic.
 *   - briefing    Advisory content. Tight elegant spacing, memo-style.
 *
 * A page should mostly use one panel type. Mixing them is allowed when a
 * page genuinely mixes concerns (e.g. an admin page showing both a roster
 * memo and a properties registry), but never side-by-side at the same
 * visual weight.
 */

const panelVariants = cva(
  "relative bg-surface-raised text-foreground transition-shadow",
  {
    variants: {
      tone: {
        salon:
          "rounded-2xl border border-border/70 px-6 py-8 sm:px-10 sm:py-12 shadow-whisper",
        ledger:
          "rounded-md border border-border px-5 py-6 sm:px-7 sm:py-7 shadow-whisper",
        briefing:
          "rounded-sm border border-border/80 px-6 py-7 sm:px-9 sm:py-9 shadow-whisper",
        bare:
          "rounded-none border-0 p-0 shadow-none bg-transparent",
      },
      // hero — a panel that anchors the top of a page; gets more breathing room
      // and no shadow (the content image carries the weight).
      anchor: {
        true: "shadow-none",
        false: "",
      },
    },
    defaultVariants: {
      tone: "ledger",
      anchor: false,
    },
  }
);

type PanelProps = React.HTMLAttributes<HTMLElement> &
  VariantProps<typeof panelVariants> & {
    as?: "section" | "article" | "div" | "aside";
  };

function Panel({
  tone,
  anchor,
  as: Comp = "section",
  className,
  ...props
}: PanelProps) {
  // `Comp` is dynamic; `as any` is the standard shadcn-style escape hatch so
  // the React element types don't collapse to a single tag's signature.
  const Component = Comp as React.ElementType;
  return (
    <Component
      data-slot="panel"
      data-tone={tone ?? "ledger"}
      className={cn(panelVariants({ tone, anchor }), className)}
      {...props}
    />
  );
}

// Friendly named exports — these are what most pages will reach for. They map
// directly onto the page modes from the page-mode-orchestrator skill.

function SalonPanel(props: Omit<PanelProps, "tone">) {
  return <Panel tone="salon" {...props} />;
}

function LedgerPanel(props: Omit<PanelProps, "tone">) {
  return <Panel tone="ledger" {...props} />;
}

function BriefingPanel(props: Omit<PanelProps, "tone">) {
  return <Panel tone="briefing" {...props} />;
}

// PanelHeader / PanelTitle / PanelBody — give Panels an editorial top
// register without forcing every consumer to redo the typography.

function PanelHeader({
  className,
  ...props
}: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="panel-header"
      className={cn(
        "mb-6 flex flex-col gap-1.5 sm:mb-8",
        className
      )}
      {...props}
    />
  );
}

function PanelEyebrow({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="panel-eyebrow"
      className={cn("eyebrow text-accent-bronze", className)}
      {...props}
    />
  );
}

function PanelTitle({
  className,
  as: Comp = "h2",
  ...props
}: React.ComponentProps<"h2"> & { as?: "h1" | "h2" | "h3" }) {
  return (
    <Comp
      data-slot="panel-title"
      className={cn(
        "font-display text-2xl leading-[1.1] text-foreground sm:text-[1.75rem]",
        className
      )}
      {...props}
    />
  );
}

function PanelDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="panel-description"
      className={cn(
        "max-w-prose text-sm leading-relaxed text-foreground-muted",
        className
      )}
      {...props}
    />
  );
}

function PanelBody({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-body"
      className={cn("flex flex-col gap-6", className)}
      {...props}
    />
  );
}

function PanelFooter({
  className,
  ...props
}: React.ComponentProps<"footer">) {
  return (
    <footer
      data-slot="panel-footer"
      className={cn(
        "mt-8 flex items-center justify-between gap-4 border-t border-border pt-5 text-sm text-foreground-muted",
        className
      )}
      {...props}
    />
  );
}

export {
  Panel,
  SalonPanel,
  LedgerPanel,
  BriefingPanel,
  PanelHeader,
  PanelEyebrow,
  PanelTitle,
  PanelDescription,
  PanelBody,
  PanelFooter,
  panelVariants,
};
