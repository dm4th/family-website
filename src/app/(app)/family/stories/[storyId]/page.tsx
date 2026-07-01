import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveViewer } from "@/lib/guest";
import { Markdown } from "@/components/markdown";
import { Eyebrow } from "@/components/shell";
import { InlineEditable } from "@/components/authoring/inline-editable";
import { updateStory } from "../actions";
import { StoryFields, type AlbumOption, type EventOption } from "../story-fields";
import { DeleteStory } from "./delete-story";

export const dynamic = "force-dynamic";

type Params = Promise<{ storyId: string }>;

function many<T>(v: T | T[] | null | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

type PersonEmbed = { display_name: string; family_branch: string | null; death_date: string | null };
type RawStory = {
  id: string;
  title: string;
  body: string | null;
  album_id: string | null;
  event_id: string | null;
  created_by: string | null;
  created_at: string;
  story_people: { person_id: string; people: PersonEmbed | PersonEmbed[] }[];
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
function recordedLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  const [, y, mo, d] = m.map(Number) as unknown as [string, number, number, number];
  const month = MONTHS[mo - 1];
  return month ? `Recorded ${month} ${d}, ${y}` : "";
}

export default async function StoryDetailPage({ params }: { params: Params }) {
  const { storyId } = await params;

  const viewer = await resolveViewer();
  if (viewer?.isGuest) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: storyData, error } = await supabase
    .from("stories")
    .select(
      "id, title, body, album_id, event_id, created_by, created_at, " +
        "story_people(person_id, people!inner(display_name, family_branch, death_date))",
    )
    .eq("id", storyId)
    .single();
  if (error || !storyData) notFound();
  const story = storyData as unknown as RawStory;

  const people = story.story_people.flatMap((sp) => {
    const e = many(sp.people)[0];
    if (!e) return [];
    return [
      {
        id: sp.person_id,
        displayName: e.display_name,
        familyBranch: e.family_branch,
        inMemoriam: e.death_date != null,
      },
    ];
  });

  // Author name, linked album/event titles, and the option lists for editing.
  const [
    { data: author },
    { data: albumRows },
    { data: eventRows },
    linkedAlbum,
    linkedEvent,
  ] = await Promise.all([
    story.created_by
      ? supabase.from("profiles").select("full_name").eq("id", story.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("albums").select("id, title").order("created_at", { ascending: false }),
    supabase.from("events").select("id, title, event_year").order("event_year", { ascending: false }),
    story.album_id
      ? supabase.from("albums").select("id, title").eq("id", story.album_id).maybeSingle()
      : Promise.resolve({ data: null }),
    story.event_id
      ? supabase.from("events").select("id, title, event_year").eq("id", story.event_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const albums: AlbumOption[] = (albumRows ?? []).map((a) => ({
    id: a.id as string,
    title: a.title as string,
  }));
  const events: EventOption[] = (eventRows ?? []).map((e) => ({
    id: e.id as string,
    title: e.title as string,
    year: e.event_year as number,
  }));

  const authorName = (author as { full_name?: string | null } | null)?.full_name?.trim() || null;
  const meta = [authorName, recordedLabel(story.created_at)].filter(Boolean).join(" · ");

  const canDelete =
    (viewer?.isAdmin ?? false) || (user != null && story.created_by === user.id);

  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-col gap-2">
        <Link
          href="/family/stories"
          className="text-sm text-foreground-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Stories &amp; Remembrances
        </Link>

        <InlineEditable
          label="story"
          editLabel="Edit story"
          action={updateStory.bind(null, story.id)}
          display={
            <div className="flex flex-col gap-3">
              <Eyebrow>Remembrance</Eyebrow>
              <h1 className="font-display text-[2.25rem] leading-[1.05] text-foreground sm:text-[2.75rem]">
                {story.title}
              </h1>
              {meta && <p className="text-sm text-foreground-muted">{meta}</p>}
              {people.length > 0 && (
                <p className="text-sm text-foreground-subtle">
                  About{" "}
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
              {story.body && (
                <div className="mt-2 max-w-prose">
                  <Markdown source={story.body} tone="salon" />
                </div>
              )}
              {(linkedAlbum?.data || linkedEvent?.data) && (
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  {linkedAlbum?.data && (
                    <Link
                      href={`/family/archive/${linkedAlbum.data.id}`}
                      className="text-accent-family underline-offset-4 hover:underline"
                    >
                      In the album: {linkedAlbum.data.title} →
                    </Link>
                  )}
                  {linkedEvent?.data && (
                    <Link
                      href={`/family/timeline/events/${linkedEvent.data.id}`}
                      className="text-accent-family underline-offset-4 hover:underline"
                    >
                      On the timeline: {linkedEvent.data.title} ({linkedEvent.data.event_year}) →
                    </Link>
                  )}
                </div>
              )}
            </div>
          }
        >
          <StoryFields
            albums={albums}
            events={events}
            defaults={{
              title: story.title,
              body: story.body,
              albumId: story.album_id,
              eventId: story.event_id,
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

      {canDelete && (
        <div className="flex justify-end border-t border-border/70 pt-6">
          <DeleteStory storyId={story.id} />
        </div>
      )}
    </div>
  );
}
