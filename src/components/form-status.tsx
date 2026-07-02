import * as React from "react";

import { cn } from "@/lib/utils";

type FormStatusTone = "error" | "success" | "info";

/**
 * The single status idiom for the app (PRD 30). A persistent live region that
 * announces form errors and successes to assistive tech — replacing the bare
 * `<p>` blocks that appeared silently on re-render.
 *
 * Errors use `role="alert"` / `aria-live="assertive"` (interrupt); successes
 * and info use `role="status"` / `aria-live="polite"` (wait for a pause). The
 * element stays mounted even when empty so screen readers reliably announce the
 * message when it later appears; while empty it's `sr-only` (absolutely
 * positioned) so it never adds a visual gap to the surrounding layout.
 *
 * Render it unconditionally inside a form and drive it off the action state:
 *
 *   <FormStatus tone={state.status === "error" ? "error" : "success"}>
 *     {state.status === "error" ? state.message : null}
 *   </FormStatus>
 */
export function FormStatus({
  tone,
  children,
  className,
}: {
  tone?: FormStatusTone | null;
  children?: React.ReactNode;
  className?: string;
}) {
  const isError = tone === "error";
  const hasContent = Boolean(children);

  return (
    <p
      data-slot="form-status"
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      aria-atomic="true"
      className={cn(
        "text-sm",
        !hasContent && "sr-only",
        isError
          ? "text-destructive"
          : tone === "success"
            ? "text-accent-operations"
            : "text-foreground-muted",
        className,
      )}
    >
      {children}
    </p>
  );
}
