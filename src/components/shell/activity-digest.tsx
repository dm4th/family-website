import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * ActivityDigest — an elegant timeline-style list for "recent activity"
 * surfaces (dashboard home, future activity feed, future revisions
 * viewer). Replaces the SaaS raw audit-log card grid.
 *
 *   <ActivityDigest>
 *     <ActivityDigestItem
 *       when="Yesterday"
 *       title="Updated Boone cabin"
 *       by="Sarah Mathieson"
 *     />
 *   </ActivityDigest>
 */

function ActivityDigest({
  className,
  ...props
}: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="activity-digest"
      className={cn(
        "flex flex-col divide-y divide-border border-y border-border",
        className
      )}
      {...props}
    />
  );
}

function ActivityDigestItem({
  when,
  title,
  by,
  href,
  className,
  ...props
}: Omit<React.ComponentProps<"li">, "title"> & {
  when: React.ReactNode;
  title: React.ReactNode;
  by?: React.ReactNode;
  href?: string;
}) {
  const content = (
    <div className="grid grid-cols-[6.5rem_1fr] gap-x-6 gap-y-1 py-4 sm:grid-cols-[8rem_1fr] sm:py-5">
      <span className="eyebrow self-start pt-1 text-foreground-subtle">
        {when}
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-sm leading-snug text-foreground sm:text-[0.95rem]">
          {title}
        </span>
        {by && (
          <span className="text-xs text-foreground-subtle">{by}</span>
        )}
      </div>
    </div>
  );

  return (
    <li
      data-slot="activity-digest-item"
      className={cn(
        href && "transition-colors hover:bg-surface/60",
        className
      )}
      {...props}
    >
      {href ? <a href={href} className="block px-1">{content}</a> : content}
    </li>
  );
}

export { ActivityDigest, ActivityDigestItem };
