"use client";

import { CreateFlow } from "@/components/authoring/create-flow";
import { createStory } from "./actions";
import {
  StoryFields,
  type AlbumOption,
  type EventOption,
} from "./story-fields";

/**
 * "Record a Memory" entry point on the stories hub. Text-first (audio is
 * deferred): a title, the memory, who it's about, and optionally the album or
 * timeline event it belongs to.
 */
export function StoryCreate({
  albums,
  events,
}: {
  albums: AlbumOption[];
  events: EventOption[];
}) {
  return (
    <CreateFlow
      triggerLabel="Record a Memory"
      title="Record a memory"
      description="A story about the family, in your words. Add who it's about and where it belongs; you can always edit it later."
      action={createStory}
      submitLabel="Save Memory"
    >
      <StoryFields albums={albums} events={events} />
    </CreateFlow>
  );
}
