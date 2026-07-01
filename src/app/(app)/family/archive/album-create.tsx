"use client";

import { CreateFlow } from "@/components/authoring/create-flow";
import { RichTextField } from "@/components/authoring/rich-text-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAlbum } from "./actions";

/**
 * "New Album" entry point for the Photo Archive. Opens the shared CreateFlow
 * side panel with the minimum fields — a title, an optional era, and an
 * optional description — then drops the family onto the new album to start
 * adding scans.
 */
export function AlbumCreate() {
  return (
    <CreateFlow
      triggerLabel="New Album"
      title="New album"
      description="Group historical photos into a collection. You can add scans and dates once it exists."
      action={createAlbum}
      submitLabel="Create Album"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="album-title">Title</Label>
        <Input
          id="album-title"
          name="title"
          required
          placeholder="e.g. Summers at Squam"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="album-era">Era</Label>
        <Input
          id="album-era"
          name="era"
          placeholder="e.g. 1960s–1970s"
        />
        <p className="text-xs text-foreground-subtle">
          A rough period for the collection. Optional.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="album-description">Description</Label>
        <RichTextField
          name="description"
          tone="salon"
          rows={5}
          ariaLabel="Album description"
          placeholder="What this album is about, who's in it, where it was taken…"
        />
      </div>
    </CreateFlow>
  );
}
