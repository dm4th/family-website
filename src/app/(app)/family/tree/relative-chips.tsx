"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { removeRelationship } from "./actions";

export type RelativeChip = {
  id: string;
  displayName: string;
  span: string;
  inMemoriam: boolean;
  /** The relationship row that connects this relative — present only for stored
   * (parent/spouse) edges, so it can be removed. Siblings are derived and omit it. */
  edgeId?: string;
};

/**
 * A labeled group of relatives (Parents, Children, …) as links to each person's
 * page. Site admins get a small remove control per stored connection (RLS
 * restricts relationship DELETE to admins).
 */
export function RelativeChips({
  label,
  relatives,
  focusPersonId,
  canRemove,
}: {
  label: string;
  relatives: RelativeChip[];
  focusPersonId: string;
  canRemove: boolean;
}) {
  if (relatives.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="eyebrow text-foreground-subtle">{label}</p>
      <ul className="flex flex-wrap gap-2">
        {relatives.map((r) => (
          <li key={`${r.id}-${r.edgeId ?? "derived"}`}>
            <RelativeItem
              relative={r}
              focusPersonId={focusPersonId}
              canRemove={canRemove}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RelativeItem({
  relative,
  focusPersonId,
  canRemove,
}: {
  relative: RelativeChip;
  focusPersonId: string;
  canRemove: boolean;
}) {
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (removed) return null;

  const showRemove = canRemove && relative.edgeId;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-md border border-border bg-surface py-1 pl-3 text-sm",
        showRemove ? "pr-1" : "pr-3",
      )}
    >
      <Link
        href={`/family/tree/${relative.id}`}
        className="flex items-center gap-1.5 text-foreground underline-offset-4 hover:underline"
      >
        {relative.inMemoriam && (
          <span aria-hidden className="text-foreground-muted">
            †
          </span>
        )}
        {relative.displayName}
        {relative.span && (
          <span className="text-xs text-foreground-subtle">{relative.span}</span>
        )}
      </Link>
      {showRemove && (
        <button
          type="button"
          disabled={isPending}
          aria-label={`Remove connection to ${relative.displayName}`}
          title="Remove this connection"
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await removeRelationship(relative.edgeId!, focusPersonId);
              if (res.ok) setRemoved(true);
              else setError(res.message);
            })
          }
          className="inline-flex size-5 items-center justify-center rounded text-foreground-subtle transition-colors hover:bg-background hover:text-foreground disabled:opacity-50"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
      {error && <span className="sr-only">{error}</span>}
    </span>
  );
}
