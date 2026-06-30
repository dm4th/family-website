"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RemovePhotoButton } from "@/components/remove-photo-button";
import { setAvatarFromPhoto } from "../../profile/actions";

export type GalleryPhoto = {
  id: string;
  storagePath: string;
  caption: string | null;
  signedUrl: string;
  /** Full-size object; featured tile renders this, grid tiles fall back to it. */
  fallbackUrl?: string;
  uploadedBy: string | null;
};

/**
 * Family photo gallery — a "story-grid" layout. The first/most-recent photo
 * anchors the row; the rest flow as a supporting strip below it. Avoids the
 * SaaS-thumbnail-dump aesthetic.
 */
export function PhotoGallery({
  photos,
  canSetAvatar,
  currentAvatarPath,
  currentUserId,
  isAdmin,
}: {
  photos: GalleryPhoto[];
  canSetAvatar: boolean;
  currentAvatarPath: string | null;
  currentUserId: string | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (photos.length === 0) {
    return (
      <p className="text-sm italic text-foreground-subtle">
        No photos yet. Be the first to add one above.
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

  function canRemove(photo: GalleryPhoto): boolean {
    return isAdmin || (!!currentUserId && photo.uploadedBy === currentUserId);
  }

  const [featured, ...rest] = photos;

  return (
    <div className="flex flex-col gap-6">
      {/* Featured photo — anchors the gallery. */}
      <Tile
        photo={featured!}
        isAvatar={currentAvatarPath === featured!.storagePath}
        canSetAvatar={canSetAvatar}
        canRemove={canRemove(featured!)}
        busyId={busyId}
        onPromote={promote}
        featured
      />

      {rest.length > 0 && (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {rest.map((photo) => (
            <li key={photo.id}>
              <Tile
                photo={photo}
                isAvatar={currentAvatarPath === photo.storagePath}
                canSetAvatar={canSetAvatar}
                canRemove={canRemove(photo)}
                busyId={busyId}
                onPromote={promote}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A gallery <img> that swaps to a full-size fallback if its (thumbnail) source
 * fails to load. Plain <img> on purpose — signed URLs rotate per request, which
 * is incompatible with next/image's URL-keyed optimizer (see PRD 17).
 */
function TileImg({
  src,
  fallbackSrc,
  alt,
  eager,
}: {
  src: string;
  fallbackSrc: string | null;
  alt: string;
  eager: boolean;
}) {
  // Reset to the (new) src when it changes — signed URLs rotate per request, so
  // a remount-less prop change should drop any prior onError fallback. Adjusting
  // state during render is the React-blessed alternative to a setState effect.
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
      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => {
        if (fallbackSrc && current !== fallbackSrc) setCurrent(fallbackSrc);
      }}
    />
  );
}

function Tile({
  photo,
  isAvatar,
  canSetAvatar,
  canRemove,
  busyId,
  onPromote,
  featured = false,
}: {
  photo: GalleryPhoto;
  isAvatar: boolean;
  canSetAvatar: boolean;
  canRemove: boolean;
  busyId: string | null;
  onPromote: (id: string) => void;
  featured?: boolean;
}) {
  return (
    <figure className="group flex flex-col gap-2">
      <div
        className={
          "relative overflow-hidden rounded-md bg-surface-sunken ring-1 ring-border " +
          (featured
            ? "aspect-[16/10] sm:aspect-[5/3]"
            : "aspect-square")
        }
      >
        <TileImg
          // Featured tile anchors the gallery — render the full object. Grid
          // tiles use the small thumb and fall back to the full object on error
          // (e.g. a photo without a generated thumbnail).
          src={featured ? photo.fallbackUrl ?? photo.signedUrl : photo.signedUrl}
          fallbackSrc={featured ? null : photo.fallbackUrl ?? null}
          alt={photo.caption ?? "Family photo"}
          eager={featured}
        />
        {isAvatar && (
          <Badge variant="status" className="absolute left-3 top-3">
            Avatar
          </Badge>
        )}
      </div>
      {(photo.caption || (canSetAvatar && !isAvatar) || canRemove) && (
        <figcaption className="flex flex-col gap-2">
          {photo.caption && (
            <p
              className={
                featured
                  ? "text-sm leading-relaxed text-foreground-muted"
                  : "line-clamp-2 text-xs text-foreground-subtle"
              }
            >
              {photo.caption}
            </p>
          )}
          {canSetAvatar && !isAvatar && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="self-start text-xs text-foreground-muted"
              disabled={busyId === photo.id}
              onClick={() => onPromote(photo.id)}
            >
              {busyId === photo.id ? "Setting…" : "Use as My Avatar"}
            </Button>
          )}
          <RemovePhotoButton photoId={photo.id} canRemove={canRemove} />
        </figcaption>
      )}
    </figure>
  );
}
