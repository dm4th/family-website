"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { deletePhoto } from "@/app/(app)/photos/actions";

type Variant = "inline" | "overlay";

/**
 * Confirm-then-delete affordance used on photo tiles and on the property
 * page hero. Server-side RLS does the real enforcement; the `canRemove`
 * prop just decides whether to render the button at all.
 *
 * - `inline` variant is a small ghost button meant to live in a figcaption
 *   alongside the existing "Use as my avatar" pattern.
 * - `overlay` variant is positioned absolutely in the top-right corner of
 *   a large image (e.g. the property hero) and only fades in on hover.
 */
export function RemovePhotoButton({
  photoId,
  canRemove,
  variant = "inline",
  label = "Remove",
  confirmTitle = "Remove this photo?",
  confirmBody = "This will permanently delete the photo from the family archive. It can't be undone.",
}: {
  photoId: string;
  canRemove: boolean;
  variant?: Variant;
  label?: string;
  confirmTitle?: string;
  confirmBody?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!canRemove) return null;

  async function confirm() {
    const result = await deletePhoto(photoId);
    if (!result.ok) {
      toast.error("Couldn't remove photo", { description: result.message });
      return;
    }
    toast.success("Photo removed");
    setOpen(false);
    startTransition(() => router.refresh());
  }

  const trigger =
    variant === "overlay" ? (
      <Button
        type="button"
        size="sm"
        variant="destructive"
        className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        aria-label="Remove photo"
      >
        {label}
      </Button>
    ) : (
      <Button
        type="button"
        size="xs"
        variant="ghost"
        className="self-start text-xs text-foreground-muted hover:text-destructive"
      >
        {label}
      </Button>
    );

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
          <AlertDialogDescription>{confirmBody}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              void confirm();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? "Removing…" : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
