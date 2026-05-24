"use client";

export type PropertyPhoto = {
  id: string;
  storagePath: string;
  caption: string | null;
  signedUrl: string;
  uploadedBy: string | null;
};

export function PropertyGallery({ photos }: { photos: PropertyPhoto[] }) {
  if (photos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No photos yet — drop one in above.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
      {photos.map((photo) => (
        <li
          key={photo.id}
          className="overflow-hidden rounded-lg border border-border bg-card"
        >
          <div className="aspect-square relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.signedUrl}
              alt={photo.caption ?? "Property photo"}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
          {photo.caption && (
            <div className="px-2 py-2">
              <p className="text-xs text-muted-foreground line-clamp-2">
                {photo.caption}
              </p>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
