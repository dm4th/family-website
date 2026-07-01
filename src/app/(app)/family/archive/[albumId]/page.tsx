import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveViewer } from "@/lib/guest";
import { withSignedUrls } from "@/lib/photos";
import { Eyebrow } from "@/components/shell";
import { PhotoUpload } from "@/components/photo-upload";
import { AlbumHeader } from "./album-header";
import { ArchiveGallery, type ArchivePhoto } from "./archive-gallery";
import { ZipUpload } from "./zip-upload";
import { loadStorySummaries } from "../../stories/load-stories";
import { StoryList } from "../../stories/story-list";

export const dynamic = "force-dynamic";

type Params = Promise<{ albumId: string }>;

export default async function AlbumDetailPage({ params }: { params: Params }) {
  const { albumId } = await params;

  const viewer = await resolveViewer();
  if (viewer?.isGuest) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: adminCheck } = await supabase.rpc("is_admin");
  const isAdmin = adminCheck === true;

  const { data: album, error } = await supabase
    .from("albums")
    .select("id, title, era, description, cover_photo_id")
    .eq("id", albumId)
    .single();
  if (error || !album) notFound();

  // Photos in this album, in curation order.
  const { data: linkRows } = await supabase
    .from("album_photos")
    .select(
      "photo_id, sort_order, added_at, photos!inner(id, storage_path, caption, taken_on, circa, uploaded_by)",
    )
    .eq("album_id", albumId)
    .order("sort_order", { ascending: true })
    .order("added_at", { ascending: true });

  type RawPhoto = {
    id: string;
    storage_path: string;
    caption: string | null;
    taken_on: string | null;
    circa: string | null;
    uploaded_by: string | null;
  };
  const rawPhotos: RawPhoto[] = (linkRows ?? []).flatMap((row) => {
    const p = (row as { photos: RawPhoto | RawPhoto[] | null }).photos;
    if (!p) return [];
    return Array.isArray(p) ? p : [p];
  });

  // People tagged across these photos (members and ancestors alike).
  const photoIds = rawPhotos.map((p) => p.id);
  type TagRow = {
    photo_id: string;
    person_id: string;
    people:
      | { display_name: string; family_branch: string | null; death_date: string | null }
      | { display_name: string; family_branch: string | null; death_date: string | null }[]
      | null;
  };
  const tagsByPhoto = new Map<string, ArchivePhoto["people"]>();
  if (photoIds.length > 0) {
    const { data: tagRows } = await supabase
      .from("photo_people")
      .select("photo_id, person_id, people!inner(display_name, family_branch, death_date)")
      .in("photo_id", photoIds);
    for (const row of (tagRows ?? []) as TagRow[]) {
      const person = Array.isArray(row.people) ? row.people[0] : row.people;
      if (!person) continue;
      const list = tagsByPhoto.get(row.photo_id) ?? [];
      list.push({
        id: row.person_id,
        displayName: person.display_name,
        familyBranch: person.family_branch,
        inMemoriam: person.death_date != null,
      });
      tagsByPhoto.set(row.photo_id, list);
    }
  }

  // Grid tiles use the thumb; the lightbox reads `fallbackUrl` (the full object).
  const signed = await withSignedUrls(
    rawPhotos.map((p) => ({ id: p.id, storagePath: p.storage_path })),
    "thumb",
  );
  const urlById = new Map(signed.map((s) => [s.id, s]));

  const photos: ArchivePhoto[] = rawPhotos.flatMap((p) => {
    const url = urlById.get(p.id);
    if (!url) return [];
    return [
      {
        id: p.id,
        signedUrl: url.signedUrl,
        fallbackUrl: url.fallbackUrl ?? null,
        caption: p.caption,
        takenOn: p.taken_on,
        circa: p.circa,
        uploadedBy: p.uploaded_by,
        people: tagsByPhoto.get(p.id) ?? [],
      },
    ];
  });

  const stories = await loadStorySummaries({ albumId: album.id });

  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-col gap-2">
        <Link
          href="/family/archive"
          className="text-sm text-foreground-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          ← The Archive
        </Link>
        <AlbumHeader
          albumId={album.id}
          title={album.title}
          era={album.era}
          description={album.description}
        />
      </div>

      <section className="flex flex-col gap-5">
        <Eyebrow>Add scans</Eyebrow>
        <PhotoUpload
          attachment={{ kind: "album", albumId: album.id }}
          label="Add Scans"
        />
        <ZipUpload albumId={album.id} />
        <p className="text-xs text-foreground-subtle">
          Historical photos live here, not on a member&apos;s profile. After
          adding, open a photo to set its date and note who&apos;s in it.
        </p>
      </section>

      <ArchiveGallery
        albumId={album.id}
        coverPhotoId={album.cover_photo_id}
        photos={photos}
        currentUserId={user?.id ?? null}
        isAdmin={isAdmin}
      />

      {stories.length > 0 && (
        <section className="flex flex-col gap-5">
          <h2 className="font-display text-2xl leading-tight text-foreground sm:text-[1.75rem]">
            Stories
          </h2>
          <StoryList stories={stories} />
        </section>
      )}
    </div>
  );
}
