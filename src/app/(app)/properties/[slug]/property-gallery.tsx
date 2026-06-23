"use client";

import { RemovePhotoButton } from "@/components/remove-photo-button";

export type PropertyPhoto = {
  id: string;
  storagePath: string;
  caption: string | null;
  signedUrl: string;
  uploadedBy: string | null;
};

/**
 * Property gallery — the *supporting* photo strip on a property detail page.
 * The hero photo is rendered separately at the top of the page; this grid
 * holds the rest, sized for scanning rather than reverence.
 */
export function PropertyGallery({
  photos,
  currentUserId,
  canManage,
}: {
  photos: PropertyPhoto[];
  currentUserId: string | null;
  canManage: boolean;
}) {
  if (photos.length === 0) {
    return (
      <p className="text-sm italic text-foreground-subtle">
        No additional photos yet.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {photos.map((photo) => {
        const canRemove =
          canManage ||
          (!!currentUserId && photo.uploadedBy === currentUserId);
        return (
          <li key={photo.id} className="flex flex-col gap-2">
            <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-surface-sunken ring-1 ring-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.signedUrl}
                alt={photo.caption ?? "Property photo"}
                className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.02]"
                loading="lazy"
              />
            </div>
            {photo.caption && (
              <p className="line-clamp-2 text-xs text-foreground-subtle">
                {photo.caption}
              </p>
            )}
            <RemovePhotoButton photoId={photo.id} canRemove={canRemove} />
          </li>
        );
      })}
    </ul>
  );
}
