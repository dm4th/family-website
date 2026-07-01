import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveViewer } from "@/lib/guest";
import { withSignedUrls } from "@/lib/photos";
import { Markdown } from "@/components/markdown";
import { Eyebrow, SectionRule } from "@/components/shell";
import { InlineEditable } from "@/components/authoring/inline-editable";
import { type FuzzyDate } from "@/components/authoring/fuzzy-date-field";
import { dateLabel, parseYear } from "@/lib/timeline";
import { updateEvent } from "../../actions";
import { EventEditFields } from "./event-edit-fields";
import { EventPhotoLinker, type LinkCandidate } from "./event-photo-linker";
import { DeleteEvent } from "./delete-event";
import { loadStorySummaries } from "../../../stories/load-stories";
import { StoryList } from "../../../stories/story-list";

export const dynamic = "force-dynamic";

type Params = Promise<{ eventId: string }>;

function many<T>(v: T | T[] | null | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

type PersonEmbed = {
  display_name: string;
  family_branch: string | null;
  death_date: string | null;
};

type RawEventDetail = {
  id: string;
  title: string;
  description: string | null;
  event_date: string | null;
  event_circa: string | null;
  event_year: number;
  location: string | null;
  created_by: string | null;
  event_people: { person_id: string; people: PersonEmbed | PersonEmbed[] }[];
  event_photos: { photo_id: string }[];
};

export default async function EventDetailPage({ params }: { params: Params }) {
  const { eventId } = await params;

  const viewer = await resolveViewer();
  if (viewer?.isGuest) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: eventData, error } = await supabase
    .from("events")
    .select(
      "id, title, description, event_date, event_circa, event_year, location, created_by, " +
        "event_people(person_id, people!inner(display_name, family_branch, death_date)), " +
        "event_photos(photo_id)",
    )
    .eq("id", eventId)
    .single();
  if (error || !eventData) notFound();
  const event = eventData as unknown as RawEventDetail;

  const subjectRows = event.event_people ?? [];
  const people = subjectRows.flatMap((r) => {
    const e = many(r.people)[0];
    if (!e) return [];
    return [
      {
        id: r.person_id,
        displayName: e.display_name,
        familyBranch: e.family_branch,
        inMemoriam: e.death_date != null,
      },
    ];
  });

  const linkedIds = new Set((event.event_photos ?? []).map((r) => r.photo_id));

  // Candidate photos to curate: archive scans from this event's year, plus any
  // already-linked photo (so it can be unlinked even if its year differs).
  const { data: archiveRows } = await supabase
    .from("photos")
    .select("id, storage_path, caption, taken_on, circa")
    .eq("is_archival", true);
  type RawPhoto = {
    id: string;
    storage_path: string;
    caption: string | null;
    taken_on: string | null;
    circa: string | null;
  };
  const candidatesRaw = ((archiveRows ?? []) as RawPhoto[]).filter(
    (p) => parseYear(p.taken_on, p.circa) === event.event_year || linkedIds.has(p.id),
  );

  const signed = await withSignedUrls(
    candidatesRaw.map((p) => ({ id: p.id, storagePath: p.storage_path, caption: p.caption })),
    "thumb",
  );
  const candidates: LinkCandidate[] = signed.map((s) => ({
    id: s.id,
    signedUrl: s.signedUrl,
    fallbackUrl: s.fallbackUrl ?? null,
    caption: s.caption,
    linked: linkedIds.has(s.id),
  }));

  const stories = await loadStorySummaries({ eventId: event.id });

  const canDelete =
    (viewer?.isAdmin ?? false) || (user != null && event.created_by === user.id);

  const label = dateLabel(event.event_date, event.event_circa, event.event_year);
  const defaultDate: FuzzyDate = event.event_date
    ? { precision: "exact", date: event.event_date }
    : event.event_circa
      ? { precision: "circa", text: event.event_circa }
      : { precision: "none" };

  const contextLine = [label, event.location].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-col gap-2">
        <Link
          href="/family/timeline"
          className="text-sm text-foreground-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          ← The Family Timeline
        </Link>

        <InlineEditable
          label="event"
          editLabel="Edit event"
          action={updateEvent.bind(null, event.id)}
          display={
            <div className="flex flex-col gap-3">
              <Eyebrow>Timeline</Eyebrow>
              <h1 className="font-display text-[2.25rem] leading-[1.05] text-foreground sm:text-[2.75rem]">
                {event.title}
              </h1>
              {contextLine && (
                <p className="text-sm text-foreground-muted">{contextLine}</p>
              )}
              {people.length > 0 && (
                <p className="text-sm text-foreground-subtle">
                  {people.map((p, i) => (
                    <span key={p.id}>
                      {i > 0 && ", "}
                      <Link
                        href={`/family/tree/${p.id}`}
                        className="underline-offset-4 hover:text-foreground hover:underline"
                      >
                        {p.inMemoriam ? `† ${p.displayName}` : p.displayName}
                      </Link>
                    </span>
                  ))}
                </p>
              )}
              {event.description && (
                <div className="mt-2 max-w-prose">
                  <Markdown source={event.description} tone="salon" />
                </div>
              )}
            </div>
          }
        >
          <EventEditFields
            defaults={{
              title: event.title,
              date: defaultDate,
              location: event.location,
              description: event.description,
              people: people.map((p) => ({
                id: p.id,
                displayName: p.displayName,
                familyBranch: p.familyBranch,
                inMemoriam: p.inMemoriam,
              })),
            }}
          />
        </InlineEditable>
      </div>

      <section className="flex flex-col gap-5">
        <SectionRule label="Photographs" />
        <p className="text-sm text-foreground-muted">
          Link archive scans from {event.event_year} to this event. Linked photos
          appear on the event here and on the timeline.
        </p>
        <EventPhotoLinker eventId={event.id} candidates={candidates} />
      </section>

      {stories.length > 0 && (
        <section className="flex flex-col gap-5">
          <SectionRule label="Stories" />
          <StoryList stories={stories} />
        </section>
      )}

      {canDelete && (
        <div className="flex justify-end border-t border-border/70 pt-6">
          <DeleteEvent eventId={event.id} />
        </div>
      )}
    </div>
  );
}
