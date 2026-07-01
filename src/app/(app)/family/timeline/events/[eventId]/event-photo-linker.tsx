"use client";

import { useState, useTransition } from "react";
import { Check, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TimelinePhoto } from "@/lib/timeline";
import { setEventPhoto } from "../../actions";

export type LinkCandidate = TimelinePhoto & { linked: boolean };

/**
 * Curate which archive photos appear on this event. Offers the archive scans
 * from the event's year (plus anything already linked); clicking a tile links
 * or unlinks it via the `event_photos` join. Kept lightweight — no separate
 * album picker; the year is the natural candidate set.
 */
export function EventPhotoLinker({
  eventId,
  candidates,
}: {
  eventId: string;
  candidates: LinkCandidate[];
}) {
  const [linked, setLinked] = useState<Record<string, boolean>>(
    Object.fromEntries(candidates.map((c) => [c.id, c.linked])),
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (candidates.length === 0) {
    return (
      <p className="text-sm italic text-foreground-subtle">
        No archive photos from this year yet. Add scans with this year in{" "}
        The Archive and they&rsquo;ll show up here to link.
      </p>
    );
  }

  function toggle(id: string) {
    const next = !linked[id];
    setLinked((cur) => ({ ...cur, [id]: next }));
    startTransition(async () => {
      setError(null);
      const res = await setEventPhoto(eventId, id, next);
      if (!res.ok) {
        setError(res.message);
        setLinked((cur) => ({ ...cur, [id]: !next })); // revert
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
        {candidates.map((c) => {
          const isLinked = linked[c.id];
          return (
            <li key={c.id}>
              <button
                type="button"
                disabled={isPending}
                aria-pressed={isLinked}
                onClick={() => toggle(c.id)}
                className={cn(
                  "group relative block w-full overflow-hidden rounded-lg border-2 transition-colors disabled:opacity-60",
                  isLinked ? "border-accent-family" : "border-border/70 hover:border-foreground",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.signedUrl}
                  alt={c.caption ?? "Archive photo"}
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
                <span
                  className={cn(
                    "absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-full text-xs",
                    isLinked
                      ? "bg-accent-family text-accent-family-foreground"
                      : "bg-background/80 text-foreground-muted",
                  )}
                >
                  {isLinked ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : (
                    <Plus className="size-3.5" aria-hidden />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
