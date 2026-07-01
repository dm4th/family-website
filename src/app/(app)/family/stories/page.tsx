import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveViewer } from "@/lib/guest";
import { PageIntro } from "@/components/shell";
import { loadStorySummaries } from "./load-stories";
import { StoryCreate } from "./story-create";
import { StoryList } from "./story-list";
import type { AlbumOption, EventOption } from "./story-fields";

export const dynamic = "force-dynamic";

export default async function StoriesPage() {
  const viewer = await resolveViewer();
  if (viewer?.isGuest) notFound();

  const supabase = await createClient();

  const [{ data: albumRows }, { data: eventRows }, stories] = await Promise.all([
    supabase.from("albums").select("id, title").order("created_at", { ascending: false }),
    supabase.from("events").select("id, title, event_year").order("event_year", { ascending: false }),
    loadStorySummaries(),
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

  return (
    <div className="flex flex-col gap-10">
      <PageIntro
        mode="family"
        eyebrow="Family · Legacy"
        title="Stories & Remembrances"
        context="The family's memories, in the family's words. Record how someone met, a place that mattered, a person we miss. Each one can point to the people it's about, an album, or a moment on the timeline."
        action={<StoryCreate albums={albums} events={events} />}
      />

      {stories.length === 0 ? (
        <div className="rounded-2xl border border-border/70 bg-surface px-8 py-16 text-center">
          <p className="font-display text-xl text-foreground">No stories yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-foreground-muted">
            Record the first memory above. A few sentences is plenty; you can
            always come back and add more. Stories appear on the people they&rsquo;re
            about, in{" "}
            <Link
              href="/family/archive"
              className="text-accent-family underline-offset-4 hover:underline"
            >
              The Archive
            </Link>
            , and on the{" "}
            <Link
              href="/family/timeline"
              className="text-accent-family underline-offset-4 hover:underline"
            >
              timeline
            </Link>
            .
          </p>
        </div>
      ) : (
        <StoryList stories={stories} />
      )}
    </div>
  );
}
