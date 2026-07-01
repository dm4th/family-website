"use client";

import { FuzzyDateField, type FuzzyDate } from "@/components/authoring/fuzzy-date-field";
import { PeoplePicker } from "@/components/authoring/people-picker";
import { RichTextField } from "@/components/authoring/rich-text-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type EventDefaults = {
  title: string;
  date: FuzzyDate;
  location: string | null;
  description: string | null;
  people: {
    id: string;
    displayName: string;
    familyBranch?: string | null;
    inMemoriam?: boolean;
  }[];
};

/**
 * The edit field set for an event, used inside the InlineEditable on the event
 * page. Mirrors the create flow's fields (title / when / where / who / story)
 * but pre-filled from the current values.
 */
export function EventEditFields({ defaults }: { defaults: EventDefaults }) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-event-title">Title</Label>
        <Input
          id="edit-event-title"
          name="title"
          required
          defaultValue={defaults.title}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>When</Label>
        <FuzzyDateField
          name="date"
          defaultValue={defaults.date}
          circaPlaceholder="e.g. summer 1968, June 1972"
        />
        <p className="text-xs text-foreground-subtle">A year is required.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-event-location">Where</Label>
        <Input
          id="edit-event-location"
          name="location"
          defaultValue={defaults.location ?? ""}
          placeholder="e.g. Squam Lake, New Hampshire"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Who was there</Label>
        <PeoplePicker
          name="people"
          defaultSelected={defaults.people}
          placeholder="Search family &amp; ancestors…"
          emptyHint="No one tagged yet."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>The story</Label>
        <RichTextField
          name="description"
          tone="salon"
          rows={6}
          defaultValue={defaults.description}
          ariaLabel="Event story"
          placeholder="What happened, and why it's remembered…"
        />
      </div>
    </>
  );
}
