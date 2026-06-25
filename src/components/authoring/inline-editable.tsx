"use client";

import { useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { idleState, type SaveState } from "./save-state";

/**
 * InlineEditable — "edit where you read" (PRD 12, slice 4). Renders content
 * with an Edit affordance; clicking swaps in the editor in place (Save /
 * Cancel) instead of routing to a separate /edit page.
 *
 * It owns only the read↔edit toggle, the save lifecycle, and the Saved/Error
 * chrome. The consumer supplies:
 *   - `display`  — what shows in read mode (e.g. a <Markdown> block)
 *   - `children` — the edit fields (e.g. a <RichTextField name="...">)
 *   - `action`   — a focused Server Action that writes + calls recordRevision()
 *                  and returns a SaveState. (recordRevision lives in the action,
 *                  not here — same pattern as updateProperty.)
 *
 * On a successful save it collapses back to read mode and briefly confirms.
 * The Edit control stays visible (not hover-only) so it works on touch and for
 * the eldest generation.
 */
export function InlineEditable({
  label,
  display,
  action,
  children,
  editLabel = "Edit",
  savedMessage = "Saved. Logged to revisions.",
}: {
  /** Accessible name of the thing being edited, e.g. "About". */
  label: string;
  display: ReactNode;
  action: (prev: SaveState, formData: FormData) => Promise<SaveState> | SaveState;
  children: ReactNode;
  editLabel?: string;
  savedMessage?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);

  // Run the save in the form action handler (not an effect), so collapse +
  // confirmation are driven by the result directly.
  async function onSubmit(formData: FormData) {
    setIsPending(true);
    setErrorMessage(null);
    const result = await action(idleState, formData);
    setIsPending(false);
    if (result.status === "saved") {
      setEditing(false);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 3000);
    } else if (result.status === "error") {
      setErrorMessage(result.message);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {display}
          {showSaved && (
            <p className="mt-1 text-sm text-accent-operations">{savedMessage}</p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(true)}
          aria-label={`${editLabel} ${label}`}
          className="shrink-0 text-foreground-subtle hover:text-foreground"
        >
          <Pencil aria-hidden />
          {editLabel}
        </Button>
      </div>
    );
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-3">
      {children}
      <div className="flex items-center justify-end gap-2">
        {errorMessage && (
          <p className="mr-auto text-sm text-destructive">{errorMessage}</p>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(false)}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
