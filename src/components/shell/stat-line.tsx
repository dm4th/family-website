import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * StatLine — a restrained label-over-value stat block. Used on operations
 * fact rails (Property facts) and advisory key-figure surfaces. Never
 * candy-colored — values are always foreground ink, labels are bronze
 * eyebrow, units are subtle.
 *
 *   <StatLine label="Bedrooms" value="6" />
 *   <StatLine label="Year built" value="1928" unit="renovated 2019" />
 *
 * Group several with `<StatRow>` for a horizontal fact rail.
 */

function StatLine({
  label,
  value,
  unit,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="stat-line"
      className={cn("flex flex-col gap-1", className)}
    >
      <span className="eyebrow text-accent-bronze">{label}</span>
      <span className="font-display text-xl leading-tight text-foreground sm:text-2xl">
        {value}
      </span>
      {unit && (
        <span className="text-xs text-foreground-subtle">{unit}</span>
      )}
    </div>
  );
}

function StatRow({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="stat-row"
      className={cn(
        "grid grid-cols-2 gap-6 border-y border-border py-6 sm:flex sm:flex-wrap sm:items-end sm:gap-x-12 sm:gap-y-4",
        className
      )}
      {...props}
    />
  );
}

export { StatLine, StatRow };
