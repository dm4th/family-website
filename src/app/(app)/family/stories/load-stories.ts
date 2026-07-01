import { createClient } from "@/lib/supabase/server";
import { storySnippet, type StorySummary } from "./story-list";

function many<T>(v: T | T[] | null | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

type PersonEmbed = { display_name: string; death_date: string | null };
type RawStory = {
  id: string;
  title: string;
  body: string | null;
  created_by: string | null;
  created_at: string;
  story_people: { person_id: string; people: PersonEmbed | PersonEmbed[] }[];
};

/**
 * Load story summaries for a surface. With no options it returns the whole hub
 * (newest first); `personId` / `albumId` / `eventId` scope it to the person,
 * album, or timeline event a story is about or linked to. Author names are
 * resolved from `profiles` (created_by is the recording member).
 */
export async function loadStorySummaries(opts?: {
  personId?: string;
  albumId?: string;
  eventId?: string;
  limit?: number;
}): Promise<StorySummary[]> {
  const supabase = await createClient();

  // Scope-by-person is a two-step (join → ids) so we don't force an inner join
  // that would also drop a story's other subjects from the embed.
  let storyIds: string[] | null = null;
  if (opts?.personId) {
    const { data } = await supabase
      .from("story_people")
      .select("story_id")
      .eq("person_id", opts.personId);
    storyIds = (data ?? []).map((r) => r.story_id as string);
    if (storyIds.length === 0) return [];
  }

  let q = supabase
    .from("stories")
    .select(
      "id, title, body, created_by, created_at, " +
        "story_people(person_id, people!inner(display_name, death_date))",
    )
    .order("created_at", { ascending: false });

  if (opts?.albumId) q = q.eq("album_id", opts.albumId);
  if (opts?.eventId) q = q.eq("event_id", opts.eventId);
  if (storyIds) q = q.in("id", storyIds);
  if (opts?.limit) q = q.limit(opts.limit);

  const { data } = await q;
  const rows = (data ?? []) as unknown as RawStory[];
  if (rows.length === 0) return [];

  // Resolve author (recorder) names in one query.
  const authorIds = [...new Set(rows.map((r) => r.created_by).filter((id): id is string => !!id))];
  const authorName = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", authorIds);
    for (const p of profiles ?? []) {
      const name = (p.full_name as string | null)?.trim();
      if (name) authorName.set(p.id as string, name);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    authorName: r.created_by ? (authorName.get(r.created_by) ?? null) : null,
    recordedOn: r.created_at,
    snippet: storySnippet(r.body),
    people: r.story_people.flatMap((sp) => {
      const person = many(sp.people)[0];
      if (!person) return [];
      return [
        {
          id: sp.person_id,
          displayName: person.display_name,
          inMemoriam: person.death_date != null,
        },
      ];
    }),
  }));
}
