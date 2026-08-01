"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Star, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/confirm-button";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { FormStatus } from "@/components/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { FuzzyDateField, type FuzzyDate } from "@/components/authoring/fuzzy-date-field";
import { PeoplePicker } from "@/components/authoring/people-picker";
import { idleState, type SaveState } from "@/components/authoring/save-state";
import {
  removePhotoFromAlbum,
  setAlbumCover,
  updatePhotoArchiveMeta,
} from "../actions";

export type ArchivePhoto = {
  id: string;
  signedUrl: string;
  fallbackUrl: string | null;
  caption: string | null;
  takenOn: string | null;
  circa: string | null;
  uploadedBy: string | null;
  people: {
    id: string;
    displayName: string;
    familyBranch: string | null;
    inMemoriam: boolean;
  }[];
};

/** Human date line: an exact day formatted, else the circa phrase, else null. */
function dateLabel(photo: ArchivePhoto): string | null {
  if (photo.takenOn) {
    const [y, m, d] = photo.takenOn.split("-").map(Number);
    if (y && m && d) {
      const month = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
      ][m - 1];
      return `${month} ${d}, ${y}`;
    }
  }
  return photo.circa ?? null;
}

function toFuzzyDate(photo: ArchivePhoto): FuzzyDate {
  if (photo.takenOn) return { precision: "exact", date: photo.takenOn };
  if (photo.circa) return { precision: "circa", text: photo.circa };
  return { precision: "none" };
}

export function ArchiveGallery({
  albumId,
  coverPhotoId,
  photos,
  currentUserId,
  isAdmin,
}: {
  albumId: string;
  coverPhotoId: string | null;
  photos: ArchivePhoto[];
  currentUserId: string | null;
  isAdmin: boolean;
}) {
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  if (photos.length === 0) {
    return (
      <p className="text-sm italic text-foreground-subtle">
        No scans in this album yet. Add the first one above.
      </p>
    );
  }

  const editing = photos.find((p) => p.id === editId) ?? null;
  const lightboxIndex = photos.findIndex((p) => p.id === lightboxId);

  return (
    <section className="flex flex-col gap-6">
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo) => {
          const label = dateLabel(photo);
          return (
            <li key={photo.id}>
              <figure className="group flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setLightboxId(photo.id)}
                  className="relative block aspect-square overflow-hidden rounded-md bg-surface-sunken ring-1 ring-border"
                  aria-label={`View ${photo.caption ?? "photo"} full size`}
                >
                  <GalleryImg
                    src={photo.signedUrl}
                    fallbackSrc={photo.fallbackUrl}
                    alt={photo.caption ?? "Archive photo"}
                  />
                  {coverPhotoId === photo.id && (
                    <span className="absolute left-2 top-2 rounded bg-background/85 px-1.5 py-0.5 text-[0.625rem] font-medium text-foreground-muted">
                      Cover
                    </span>
                  )}
                </button>

                <figcaption className="flex flex-col gap-1.5">
                  {label && (
                    <p className="text-xs font-medium text-foreground-muted">{label}</p>
                  )}
                  {photo.caption && (
                    <p className="line-clamp-2 text-xs text-foreground-subtle">
                      {photo.caption}
                    </p>
                  )}
                  {photo.people.length > 0 && (
                    <p className="line-clamp-1 text-xs text-foreground-subtle">
                      {photo.people
                        .map((p) => (p.inMemoriam ? `† ${p.displayName}` : p.displayName))
                        .join(", ")}
                    </p>
                  )}
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="text-xs text-foreground-muted"
                      onClick={() => setEditId(photo.id)}
                    >
                      <Pencil aria-hidden className="size-3.5" />
                      Details
                    </Button>
                    <CoverButton albumId={albumId} photoId={photo.id} isCover={coverPhotoId === photo.id} />
                    <RemoveButton
                      albumId={albumId}
                      photoId={photo.id}
                      canRemove={isAdmin || (!!currentUserId && photo.uploadedBy === currentUserId)}
                    />
                  </div>
                </figcaption>
              </figure>
            </li>
          );
        })}
      </ul>

      {/* Lightbox */}
      {lightboxIndex >= 0 && (
        <PhotoLightbox
          photos={photos}
          index={lightboxIndex}
          onClose={() => setLightboxId(null)}
          onNavigate={(i) => setLightboxId(photos[i]!.id)}
          fallbackAlt="Archive photo"
          renderCaption={(photo) => <ArchiveCaption photo={photo} />}
        />
      )}

      {/* Per-photo details editor */}
      {editing && (
        <PhotoDetailsSheet
          key={editing.id}
          albumId={albumId}
          photo={editing}
          onClose={() => setEditId(null)}
        />
      )}
    </section>
  );
}

/**
 * A gallery <img> that swaps to a full-size fallback if its thumbnail source
 * fails to load. Plain <img> — signed URLs rotate per request (see PRD 17).
 */
function GalleryImg({
  src,
  fallbackSrc,
  alt,
}: {
  src: string;
  fallbackSrc: string | null;
  alt: string;
}) {
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
      loading="lazy"
      decoding="async"
      onError={() => {
        if (fallbackSrc && current !== fallbackSrc) setCurrent(fallbackSrc);
      }}
    />
  );
}

function CoverButton({
  albumId,
  photoId,
  isCover,
}: {
  albumId: string;
  photoId: string;
  isCover: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  if (isCover) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="text-xs text-foreground-muted"
      disabled={isPending}
      onClick={async () => {
        const result = await setAlbumCover(albumId, photoId);
        if (!result.ok) {
          toast.error("Couldn't set the cover", { description: result.message });
          return;
        }
        startTransition(() => router.refresh());
      }}
    >
      <Star aria-hidden className="size-3.5" />
      Cover
    </Button>
  );
}

function RemoveButton({
  albumId,
  photoId,
  canRemove,
}: {
  albumId: string;
  photoId: string;
  canRemove: boolean;
}) {
  const router = useRouter();
  if (!canRemove) return null;
  return (
    <ConfirmButton
      triggerVariant="ghost"
      triggerSize="xs"
      triggerClassName="text-xs text-foreground-muted hover:text-destructive"
      title="Remove this photo from the album?"
      description="The photo stays in the family archive. It's only removed from this album."
      confirmLabel="Remove"
      pendingLabel="Removing…"
      destructive
      successMessage="Photo removed from the album."
      errorTitle="Couldn't remove the photo"
      onConfirm={async () => {
        const result = await removePhotoFromAlbum(albumId, photoId);
        if (!result.ok) throw new Error(result.message);
        router.refresh();
      }}
    >
      <Trash2 aria-hidden className="size-3.5" />
      Remove
    </ConfirmButton>
  );
}

/** Lightbox caption for an archive scan: date, caption, and tagged people. */
function ArchiveCaption({ photo }: { photo: ArchivePhoto }) {
  const label = dateLabel(photo);
  if (!label && !photo.caption && photo.people.length === 0) return null;
  return (
    <>
      {label && <span className="font-medium">{label}</span>}
      {label && photo.caption && <span> · </span>}
      {photo.caption}
      {photo.people.length > 0 && (
        <span className="mt-1 block text-xs text-surface/70">
          {photo.people.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ", "}
              <Link
                href={`/family/tree/${p.id}`}
                className="underline-offset-4 hover:text-surface hover:underline"
              >
                {p.inMemoriam ? `† ${p.displayName}` : p.displayName}
              </Link>
            </span>
          ))}
        </span>
      )}
    </>
  );
}

function PhotoDetailsSheet({
  albumId,
  photo,
  onClose,
}: {
  albumId: string;
  photo: ArchivePhoto;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const action = updatePhotoArchiveMeta.bind(null, photo.id, albumId);

  async function onSubmit(formData: FormData) {
    setIsPending(true);
    setErrorMessage(null);
    const result: SaveState = await action(idleState, formData);
    setIsPending(false);
    if (result.status === "saved") {
      onClose();
      router.refresh();
    } else if (result.status === "error") {
      setErrorMessage(result.message);
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="p-6">
        <SheetHeader className="p-0">
          <SheetTitle>Photo details</SheetTitle>
          <SheetDescription>
            Date this scan and note who&apos;s in it. Ancestors and members alike.
          </SheetDescription>
        </SheetHeader>

        <form action={onSubmit} className="flex flex-1 flex-col gap-5 overflow-auto">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="photo-caption">Caption</Label>
            <Input
              id="photo-caption"
              name="caption"
              defaultValue={photo.caption ?? ""}
              placeholder="A short note about this photo"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>When was it taken?</Label>
            <FuzzyDateField name="date" defaultValue={toFuzzyDate(photo)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Who&apos;s in it?</Label>
            <PeoplePicker
              name="people"
              defaultSelected={photo.people}
              placeholder="Search family by name…"
              emptyHint="No one tagged yet."
            />
          </div>

          <SheetFooter className="flex-row items-center justify-end gap-2 p-0">
            <FormStatus tone="error" className="mr-auto">
              {errorMessage}
            </FormStatus>
            <SheetClose asChild>
              <Button type="button" variant="ghost" size="sm" disabled={isPending}>
                Cancel
              </Button>
            </SheetClose>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
