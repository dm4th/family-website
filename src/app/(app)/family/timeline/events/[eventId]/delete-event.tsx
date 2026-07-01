"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteEvent } from "../../actions";

/**
 * Delete an event (its creator or a site admin only — enforced by RLS). Two-step
 * so a milestone isn't removed by a stray click.
 */
export function DeleteEvent({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(true)}
        className="text-foreground-subtle hover:text-destructive"
      >
        <Trash2 aria-hidden />
        Delete Event
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-sm text-destructive">{error}</span>}
      <span className="text-sm text-foreground-muted">Delete this event?</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={isPending}
        onClick={() => setConfirming(false)}
      >
        Cancel
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await deleteEvent(eventId);
            if (res.ok) router.push("/family/timeline");
            else setError(res.message);
          })
        }
      >
        {isPending ? "Deleting…" : "Delete"}
      </Button>
    </div>
  );
}
