"use client";

import { PeoplePicker } from "@/components/authoring/people-picker";
import { RichTextField } from "@/components/authoring/rich-text-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type AlbumOption = { id: string; title: string };
export type EventOption = { id: string; title: string; year: number };

export type StoryDefaults = {
  title?: string;
  body?: string | null;
  albumId?: string | null;
  eventId?: string | null;
  people?: {
    id: string;
    displayName: string;
    familyBranch?: string | null;
    inMemoriam?: boolean;
  }[];
};

const selectClass =
  "max-w-[22rem] rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";

/**
 * The shared field set for recording or editing a memory. Used inside the
 * CreateFlow (record) and the InlineEditable (edit). Text-first per the PRD —
 * a title and a Markdown body, who it's about, and optionally the album or
 * timeline event it belongs to.
 */
export function StoryFields({
  albums,
  events,
  defaults,
}: {
  albums: AlbumOption[];
  events: EventOption[];
  defaults?: StoryDefaults;
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="story-title">Title</Label>
        <Input
          id="story-title"
          name="title"
          required
          defaultValue={defaults?.title ?? ""}
          placeholder="e.g. How Grandpa met Grandma"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>The memory</Label>
        <RichTextField
          name="body"
          tone="salon"
          rows={8}
          defaultValue={defaults?.body ?? ""}
          ariaLabel="The memory"
          placeholder="Tell it the way you'd tell it out loud…"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Who it&rsquo;s about</Label>
        <PeoplePicker
          name="people"
          defaultSelected={defaults?.people ?? []}
          placeholder="Search family &amp; ancestors…"
          emptyHint="No one tagged yet."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="story-album">Album (optional)</Label>
        <select
          id="story-album"
          name="album_id"
          defaultValue={defaults?.albumId ?? ""}
          className={selectClass}
        >
          <option value="">— None —</option>
          {albums.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="story-event">Timeline event (optional)</Label>
        <select
          id="story-event"
          name="event_id"
          defaultValue={defaults?.eventId ?? ""}
          className={selectClass}
        >
          <option value="">— None —</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title} ({e.year})
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
