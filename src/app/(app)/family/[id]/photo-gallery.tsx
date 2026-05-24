"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setAvatarFromPhoto } from "../../profile/actions";

export type GalleryPhoto = {
  id: string;
  storagePath: string;
  caption: string | null;
  signedUrl: string;
  uploadedBy: string | null;
};

export function PhotoGallery({
  photos,
  canSetAvatar,
  currentAvatarPath,
}: {
  photos: GalleryPhoto[];
  canSetAvatar: boolean;
  currentAvatarPath: string | null;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (photos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No photos yet — be the first to add one above.
      </p>
    );
  }

  async function promote(photoId: string) {
    setBusyId(photoId);
    try {
      await setAvatarFromPhoto(photoId);
      startTransition(() => router.refresh());
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ul className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
      {photos.map((photo) => {
        const isAvatar = currentAvatarPath === photo.storagePath;
        return (
          <li
            key={photo.id}
            className="group relative overflow-hidden rounded-lg border border-border bg-card"
          >
            <div className="aspect-square relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.signedUrl}
                alt={photo.caption ?? "Family photo"}
                className="h-full w-full object-cover"
                loading="lazy"
              />
              {isAvatar && (
                <span className="absolute left-2 top-2 rounded-full bg-foreground/90 px-2 py-0.5 text-[10px] uppercase tracking-wide text-background">
                  Avatar
                </span>
              )}
            </div>
            {(photo.caption || canSetAvatar) && (
              <div className="px-2 py-2 space-y-1.5">
                {photo.caption && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {photo.caption}
                  </p>
                )}
                {canSetAvatar && !isAvatar && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full text-xs"
                    disabled={busyId === photo.id}
                    onClick={() => promote(photo.id)}
                  >
                    {busyId === photo.id ? "Setting…" : "Use as my avatar"}
                  </Button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
