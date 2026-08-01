"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { setHeroPhoto } from "./actions";

type Variant = "inline" | "overlay" | "lightbox";

/**
 * "Make This the Hero" / "Use Newest Photo" (PRD 35). Rendered only for
 * property admins; the server action re-checks `canManageProperty()` and the
 * DB column guard rejects the write regardless, so this is presentation only.
 *
 * - `inline` sits under a gallery tile, next to a Remove control.
 * - `overlay` sits on the large hero frame, same idiom as RemovePhotoButton.
 * - `lightbox` is the primary action inside the full-screen viewer, sized for
 *   a dark backdrop. This is where choosing the hero lives now: the grid stays
 *   a grid of photos, and the choice happens while you're looking at the photo
 *   full size.
 */
export function SetHeroButton({
  propertyId,
  storagePath,
  label,
  variant = "inline",
  onDone,
}: {
  propertyId: string;
  /** The photo to promote, or null to clear the choice. */
  storagePath: string | null;
  label: string;
  variant?: Variant;
  /** Called after a successful write — the viewer uses it to close itself. */
  onDone?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function handleClick() {
    const result = await setHeroPhoto(propertyId, storagePath);
    if (!result.ok) {
      toast.error("Couldn't update the hero photo", {
        description: result.message,
      });
      return;
    }
    toast.success(storagePath ? "Hero photo updated" : "Back to the newest photo");
    onDone?.();
    startTransition(() => router.refresh());
  }

  if (variant === "lightbox") {
    return (
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => void handleClick()}
        className="min-h-11 px-5"
      >
        {pending ? "Saving…" : label}
      </Button>
    );
  }

  if (variant === "overlay") {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => void handleClick()}
        className="absolute right-3 top-14 min-h-10 bg-surface/90 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        {pending ? "Saving…" : label}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="xs"
      variant="ghost"
      disabled={pending}
      onClick={() => void handleClick()}
      className="min-h-10 self-start text-xs text-foreground-muted hover:text-foreground"
    >
      {pending ? "Saving…" : label}
    </Button>
  );
}
