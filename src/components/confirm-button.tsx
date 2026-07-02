"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

type ButtonVariant = React.ComponentProps<typeof Button>["variant"];
type ButtonSize = React.ComponentProps<typeof Button>["size"];

/**
 * The single confirm idiom for the app (PRD 30). Wraps a trigger button in a
 * shadcn/Radix `AlertDialog` so every destructive or irreversible action gets a
 * focus-trapped, screen-reader-announced "are you sure?" step for free — no
 * more one-tap deletes, native `window.confirm`, or 3-second morphing buttons.
 *
 * `onConfirm` is any async work. Throw from it to signal failure: the dialog
 * stays open and a destructive toast surfaces the message. On success the
 * dialog closes and an optional `successMessage` toast fires. The confirm and
 * cancel buttons are disabled while the action is pending.
 *
 * The children are rendered inside the trigger `Button` (label, or icon+label).
 */
export function ConfirmButton({
  children,
  triggerVariant = "ghost",
  triggerSize = "sm",
  triggerClassName,
  triggerAriaLabel,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  pendingLabel = "Working…",
  destructive = false,
  disabled = false,
  successMessage,
  errorTitle = "Something went wrong",
  onConfirm,
}: {
  children: React.ReactNode;
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  triggerClassName?: string;
  /** Accessible name for the trigger when its visible content is an icon only. */
  triggerAriaLabel?: string;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  pendingLabel?: string;
  /** Style the confirm action as destructive (and colour the trigger's hover). */
  destructive?: boolean;
  disabled?: boolean;
  /** Toast shown after `onConfirm` resolves without throwing. */
  successMessage?: string;
  /** Title for the destructive toast shown when `onConfirm` throws. */
  errorTitle?: string;
  onConfirm: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm(e: React.MouseEvent) {
    // Keep the dialog open until the action settles so failures stay visible.
    e.preventDefault();
    startTransition(async () => {
      try {
        await onConfirm();
        if (successMessage) toast.success(successMessage);
        setOpen(false);
      } catch (err) {
        toast.error(errorTitle, {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Don't let an outside click / Escape close it mid-action.
        if (!pending) setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={triggerVariant}
          size={triggerSize}
          className={triggerClassName}
          disabled={disabled}
          aria-label={triggerAriaLabel}
        >
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={handleConfirm}
            className={cn(
              destructive &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
          >
            {pending ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
