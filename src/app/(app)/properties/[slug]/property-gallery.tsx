"use client";

import { useState } from "react";
import { RemovePhotoButton } from "@/components/remove-photo-button";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { SetHeroButton } from "./set-hero-button";

export type PropertyPhoto = {
  id: string;
  storagePath: string;
  caption: string | null;
  signedUrl: string;
  /** Full-size object; tiles fall back to it if the thumbnail fails to load. */
  fallbackUrl?: string;
  uploadedBy: string | null;
};

/**
 * Grid <img> that swaps to a full-size fallback if its thumbnail fails. Plain
 * <img> on purpose — signed URLs rotate per request (incompatible with
 * next/image's URL-keyed optimizer; see PRD 17).
 */
function TileImg({
  src,
  fallbackSrc,
  alt,
}: {
  src: string;
  fallbackSrc: string | null;
  alt: string;
}) {
  // Reset on src change (signed URLs rotate per request) without a setState
  // effect — adjust state during render, the React-recommended pattern.
  const [current, setCurrent] = useState(src);
  const [seenSrc, setSeenSrc] = useState(src);
  if (src !== seenSrc) {
    setSeenSrc(src);
    setCurrent(src);
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current}
      alt={alt}
      className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.02]"
      loading="lazy"
      decoding="async"
      onError={() => {
        if (fallbackSrc && current !== fallbackSrc) setCurrent(fallbackSrc);
      }}
    />
  );
}

/**
 * Property gallery — the *supporting* photo strip on a property detail page.
 * The hero photo is rendered separately at the top of the page; this grid
 * holds the rest, sized for scanning rather than reverence.
 */
export function PropertyGallery({
  photos,
  currentUserId,
  canManage,
  propertyId,
}: {
  photos: PropertyPhoto[];
  currentUserId: string | null;
  canManage: boolean;
  /** Needed for the admin-only "Make This the Hero" control (PRD 35). */
  propertyId: string;
}) {
  const [viewingId, setViewingId] = useState<string | null>(null);

  if (photos.length === 0) {
    return (
      <p className="text-sm italic text-foreground-subtle">
        No additional photos yet.
      </p>
    );
  }

  const viewingIndex = photos.findIndex((p) => p.id === viewingId);

  return (
    <>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo) => {
          const canRemove =
            canManage ||
            (!!currentUserId && photo.uploadedBy === currentUserId);
          return (
            <li key={photo.id} className="flex flex-col gap-2">
              {/* The tile itself is the affordance: click to view it large.
                  Remove sits in the corner so the photo stays the subject. */}
              <div className="group relative aspect-[4/3] overflow-hidden rounded-md bg-surface-sunken ring-1 ring-border">
                <button
                  type="button"
                  onClick={() => setViewingId(photo.id)}
                  className="block h-full w-full"
                  aria-label={`View ${photo.caption ?? "photo"} full size`}
                >
                  <TileImg
                    src={photo.signedUrl}
                    fallbackSrc={photo.fallbackUrl ?? null}
                    alt={photo.caption ?? "Property photo"}
                  />
                </button>
                <RemovePhotoButton
                  photoId={photo.id}
                  canRemove={canRemove}
                  variant="corner"
                />
              </div>
              {photo.caption && (
                <p className="line-clamp-2 text-xs text-foreground-subtle">
                  {photo.caption}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {/* Full-screen viewer — where choosing the hero now lives, so the grid
          stays a grid of photos instead of a grid of buttons. */}
      {viewingIndex >= 0 && (
        <PhotoLightbox
          photos={photos}
          index={viewingIndex}
          onClose={() => setViewingId(null)}
          onNavigate={(i) => setViewingId(photos[i]!.id)}
          fallbackAlt="Property photo"
          renderCaption={(photo) => photo.caption}
          renderActions={(photo) =>
            canManage ? (
              <SetHeroButton
                propertyId={propertyId}
                storagePath={photo.storagePath}
                label="Make This the Hero"
                variant="lightbox"
                onDone={() => setViewingId(null)}
              />
            ) : null
          }
        />
      )}
    </>
  );
}
