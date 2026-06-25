"use client";

import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { idleState, type SaveState } from "./save-state";

/**
 * CreateFlow — a consistent, light "+ Add" entry point (PRD 12, slice 4).
 * A trigger button opens a focused side panel with the *minimum* fields and an
 * instant save, so creating an album / person / event / story feels quick
 * rather than like filling out a developer form.
 *
 * Built on the existing `Sheet` primitive (no new dependency). The consumer
 * supplies the fields (`children`) and a Server Action (`action`) that returns
 * a SaveState; on success the panel closes automatically.
 */
export function CreateFlow({
  triggerLabel,
  title,
  description,
  action,
  children,
  submitLabel = "Create",
}: {
  triggerLabel: string;
  title: string;
  description?: string;
  action: (prev: SaveState, formData: FormData) => Promise<SaveState> | SaveState;
  children: ReactNode;
  submitLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Run the create in the form action handler so the panel closes on success
  // directly from the result, not via a state-watching effect.
  async function onSubmit(formData: FormData) {
    setIsPending(true);
    setErrorMessage(null);
    const result = await action(idleState, formData);
    setIsPending(false);
    if (result.status === "saved") setOpen(false);
    else if (result.status === "error") setErrorMessage(result.message);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Plus aria-hidden />
        {triggerLabel}
      </Button>

      <SheetContent side="right" className="p-6">
        <SheetHeader className="p-0">
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>

        <form action={onSubmit} className="flex flex-1 flex-col gap-4">
          <div className="flex flex-1 flex-col gap-4 overflow-auto">
            {children}
          </div>
          <SheetFooter className="flex-row items-center justify-end gap-2 p-0">
            {errorMessage && (
              <p className="mr-auto text-sm text-destructive">{errorMessage}</p>
            )}
            <SheetClose asChild>
              <Button type="button" variant="ghost" size="sm" disabled={isPending}>
                Cancel
              </Button>
            </SheetClose>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Saving…" : submitLabel}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
