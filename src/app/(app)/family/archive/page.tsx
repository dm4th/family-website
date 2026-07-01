import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveViewer } from "@/lib/guest";
import { withSignedUrls } from "@/lib/photos";
import { Eyebrow, PageIntro } from "@/components/shell";
import { AlbumCreate } from "./album-create";

export const dynamic = "force-dynamic";

type AlbumCard = {
  id: string;
  title: string;
  era: string | null;
  coverPath: string | null;
  count: number;
};

export default async function ArchivePage() {
  // The archive is family-only. RLS already returns nothing to a guest, but we
  // guard the route so a guest gets a clean 404 rather than an empty shell.
  const viewer = await resolveViewer();
  if (viewer?.isGuest) notFound();

  const supabase = await createClient();

  const { data: albumRows } = await supabase
    .from("albums")
    .select("id, title, era, cover_photo_id, created_at")
    .order("created_at", { ascending: false });
  const albums = albumRows ?? [];

  // Pull every album↔photo link (with the photo's storage path) in one query;
  // the archive is small, so grouping in memory beats N per-album round-trips.
  const { data: linkRows } = await supabase
    .from("album_photos")
    .select("album_id, photo_id, sort_order, added_at, photos(storage_path)")
    .order("sort_order", { ascending: true })
    .order("added_at", { ascending: true });

  type LinkRow = {
    album_id: string;
    photo_id: string;
    photos: { storage_path: string } | { storage_path: string }[] | null;
  };
  const byAlbum = new Map<string, { photoId: string; path: string }[]>();
  for (const row of (linkRows ?? []) as LinkRow[]) {
    const photo = Array.isArray(row.photos) ? row.photos[0] : row.photos;
    if (!photo) continue;
    const list = byAlbum.get(row.album_id) ?? [];
    list.push({ photoId: row.photo_id, path: photo.storage_path });
    byAlbum.set(row.album_id, list);
  }

  // Resolve each album's cover: the chosen cover photo if it's in the album,
  // otherwise the first photo in curation order.
  const cards: AlbumCard[] = albums.map((a) => {
    const photos = byAlbum.get(a.id) ?? [];
    const chosen = a.cover_photo_id
      ? photos.find((p) => p.photoId === a.cover_photo_id)
      : undefined;
    const cover = chosen ?? photos[0];
    return {
      id: a.id,
      title: a.title,
      era: a.era,
      coverPath: cover?.path ?? null,
      count: photos.length,
    };
  });

  // Batch-sign the covers (thumb rendition).
  const signed = await withSignedUrls(
    cards
      .filter((c) => c.coverPath)
      .map((c) => ({ id: c.id, storagePath: c.coverPath! })),
    "thumb",
  );
  const coverUrl = new Map(signed.map((s) => [s.id, s]));

  return (
    <div className="flex flex-col gap-12">
      <PageIntro
        mode="family"
        eyebrow="Family · Legacy"
        title="The Archive"
        context="Old photographs, gathered into collections. Any member can add a scan, date it, and note who's in it."
        action={<AlbumCreate />}
      />

      {cards.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const cover = coverUrl.get(card.id);
            return (
              <li key={card.id}>
                <Link href={`/family/archive/${card.id}`} className="group flex flex-col gap-3">
                  <div className="relative aspect-[5/4] overflow-hidden rounded-lg bg-surface-sunken ring-1 ring-border">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover.signedUrl}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <span className="text-sm italic text-foreground-subtle">
                          No photos yet
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <h2 className="font-display text-xl leading-tight text-foreground">
                      {card.title}
                    </h2>
                    <p className="text-xs text-foreground-subtle">
                      {[card.era, `${card.count} photo${card.count === 1 ? "" : "s"}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="max-w-prose rounded-lg border border-dashed border-border bg-surface/50 px-8 py-12">
      <Eyebrow className="mb-3">Nothing here yet</Eyebrow>
      <p className="font-display text-xl leading-relaxed text-foreground">
        The archive is empty.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-foreground-muted">
        Start the first collection: a decade of summers, a wedding, a house that
        raised a generation. Use New Album above, then add the scans.
      </p>
    </div>
  );
}
