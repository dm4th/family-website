"use client";

import { InlineEditable } from "@/components/authoring/inline-editable";
import { RichTextField } from "@/components/authoring/rich-text-field";
import { Markdown } from "@/components/markdown";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateAlbum } from "../actions";

/**
 * Album title / era / description, edited in place (PRD 12 InlineEditable).
 * The Server Action is bound to this album id and records a "album" revision.
 */
export function AlbumHeader({
  albumId,
  title,
  era,
  description,
}: {
  albumId: string;
  title: string;
  era: string | null;
  description: string | null;
}) {
  return (
    <InlineEditable
      label="album details"
      action={updateAlbum.bind(null, albumId)}
      editLabel="Edit"
      display={
        <div className="flex flex-col gap-3">
          <Eyebrowish>Album</Eyebrowish>
          <h1 className="font-display text-[2rem] leading-[1.05] text-foreground sm:text-[2.5rem]">
            {title}
          </h1>
          {era && <p className="text-sm text-foreground-muted">{era}</p>}
          {description && (
            <div className="mt-2 max-w-prose">
              <Markdown source={description} tone="salon" />
            </div>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-album-title">Title</Label>
        <Input id="edit-album-title" name="title" required defaultValue={title} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-album-era">Era</Label>
        <Input
          id="edit-album-era"
          name="era"
          defaultValue={era ?? ""}
          placeholder="e.g. 1960s–1970s"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-album-description">Description</Label>
        <RichTextField
          name="description"
          tone="salon"
          rows={5}
          defaultValue={description}
          ariaLabel="Album description"
        />
      </div>
    </InlineEditable>
  );
}

function Eyebrowish({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow text-accent-bronze">{children}</p>;
}
