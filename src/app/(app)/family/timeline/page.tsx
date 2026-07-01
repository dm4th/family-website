import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveViewer } from "@/lib/guest";
import { withSignedUrls } from "@/lib/photos";
import { PageIntro } from "@/components/shell";
import {
  dateLabel,
  parseYear,
  type TimelineItem,
  type TimelinePerson,
  type TimelinePhoto,
} from "@/lib/timeline";
import { EventCreate } from "./event-create";
import { TimelineView } from "./timeline-view";

export const dynamic = "force-dynamic";

// Supabase returns embedded rows as object-or-array; normalize to an array.
function many<T>(v: T | T[] | null | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

type PersonEmbed = {
  display_name: string;
  family_branch: string | null;
  death_date: string | null;
};
function toPerson(id: string, e: PersonEmbed | undefined): TimelinePerson | null {
  if (!e) return null;
  return {
    id,
    displayName: e.display_name,
    familyBranch: e.family_branch,
    inMemoriam: e.death_date != null,
  };
}

export default async function FamilyTimelinePage() {
  const viewer = await resolveViewer();
  if (viewer?.isGuest) notFound();

  const supabase = await createClient();

  // Events with their subjects + curated photos.
  const { data: eventRows } = await supabase
    .from("events")
    .select(
      "id, title, description, event_date, event_circa, event_year, location, " +
        "event_people(person_id, people!inner(display_name, family_branch, death_date)), " +
        "event_photos(sort_order, photos!inner(id, storage_path, caption))",
    )
    .order("event_year", { ascending: false });

  // Dated archive photos auto-assemble into the timeline. Exclude ones already
  // curated onto an event (they render under the event instead).
  const { data: photoRows } = await supabase
    .from("photos")
    .select(
      "id, storage_path, caption, taken_on, circa, " +
        "photo_people(person_id, people!inner(display_name, family_branch, death_date))",
    )
    .eq("is_archival", true)
    .or("taken_on.not.is.null,circa.not.is.null");

  type RawEvent = {
    id: string;
    title: string;
    description: string | null;
    event_date: string | null;
    event_circa: string | null;
    event_year: number;
    location: string | null;
    event_people: { person_id: string; people: PersonEmbed | PersonEmbed[] }[];
    event_photos: {
      sort_order: number;
      photos: { id: string; storage_path: string; caption: string | null } | { id: string; storage_path: string; caption: string | null }[];
    }[];
  };
  type RawPhoto = {
    id: string;
    storage_path: string;
    caption: string | null;
    taken_on: string | null;
    circa: string | null;
    photo_people: { person_id: string; people: PersonEmbed | PersonEmbed[] }[];
  };

  const events = (eventRows ?? []) as unknown as RawEvent[];
  const allArchive = (photoRows ?? []) as unknown as RawPhoto[];

  // Photos linked to any event — excluded from the standalone stream.
  const eventPhotoIds = new Set<string>();
  for (const ev of events) {
    for (const ep of ev.event_photos) {
      for (const p of many(ep.photos)) eventPhotoIds.add(p.id);
    }
  }
  const standalone = allArchive.filter((p) => !eventPhotoIds.has(p.id));

  // Sign every photo we'll render (event-curated + standalone) in one batch.
  const photoPathById = new Map<string, string>();
  for (const ev of events) {
    for (const ep of ev.event_photos) {
      for (const p of many(ep.photos)) photoPathById.set(p.id, p.storage_path);
    }
  }
  for (const p of standalone) photoPathById.set(p.id, p.storage_path);

  const signed = await withSignedUrls(
    [...photoPathById.entries()].map(([id, storagePath]) => ({ id, storagePath })),
    "thumb",
  );
  const urlById = new Map(signed.map((s) => [s.id, s]));

  function signPhoto(
    id: string,
    caption: string | null,
  ): TimelinePhoto | null {
    const u = urlById.get(id);
    if (!u) return null;
    return {
      id,
      signedUrl: u.signedUrl,
      fallbackUrl: u.fallbackUrl ?? null,
      caption,
    };
  }

  const items: TimelineItem[] = [];

  for (const ev of events) {
    const people = ev.event_people.flatMap((ep) => {
      const p = toPerson(ep.person_id, many(ep.people)[0]);
      return p ? [p] : [];
    });
    const photos = ev.event_photos
      .sort((a, b) => a.sort_order - b.sort_order)
      .flatMap((ep) =>
        many(ep.photos).flatMap((p) => {
          const sp = signPhoto(p.id, p.caption);
          return sp ? [sp] : [];
        }),
      );
    items.push({
      id: ev.id,
      kind: "event",
      year: ev.event_year,
      sortDate: ev.event_date ?? "",
      dateLabel: dateLabel(ev.event_date, ev.event_circa, ev.event_year),
      title: ev.title,
      description: ev.description,
      location: ev.location,
      people,
      photos,
    });
  }

  for (const p of standalone) {
    const year = parseYear(p.taken_on, p.circa);
    if (year === null) continue;
    const sp = signPhoto(p.id, p.caption);
    if (!sp) continue;
    const people = p.photo_people.flatMap((pp) => {
      const person = toPerson(pp.person_id, many(pp.people)[0]);
      return person ? [person] : [];
    });
    items.push({
      id: p.id,
      kind: "photo",
      year,
      sortDate: p.taken_on ?? "",
      dateLabel: dateLabel(p.taken_on, p.circa, year),
      title: null,
      description: null,
      location: null,
      people,
      photos: [sp],
    });
  }

  // People + branches present on the timeline, for the filter controls.
  const peopleById = new Map<string, TimelinePerson>();
  for (const it of items) for (const p of it.people) peopleById.set(p.id, p);
  const filterPeople = [...peopleById.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
  const branches = [
    ...new Set(
      filterPeople.map((p) => p.familyBranch).filter((b): b is string => !!b),
    ),
  ].sort();

  return (
    <div className="flex flex-col gap-10">
      <PageIntro
        mode="family"
        eyebrow="Family · Legacy"
        title="The Family Timeline"
        context="The family's story, year by year. Milestones you record and dated photographs from the archive, assembled into one chronology. Jump through the decades, or follow a single person."
        action={<EventCreate />}
      />

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border/70 bg-surface px-8 py-16 text-center">
          <p className="font-display text-xl text-foreground">
            Nothing on the timeline yet
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-foreground-muted">
            Record an event above, or add dates to photos in{" "}
            <Link
              href="/family/archive"
              className="text-accent-family underline-offset-4 hover:underline"
            >
              The Archive
            </Link>{" "}
            and they&rsquo;ll appear here automatically.
          </p>
        </div>
      ) : (
        <TimelineView items={items} people={filterPeople} branches={branches} />
      )}
    </div>
  );
}
