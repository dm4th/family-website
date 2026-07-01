"use client";

import { CreateFlow } from "@/components/authoring/create-flow";
import { FuzzyDateField } from "@/components/authoring/fuzzy-date-field";
import { PeoplePicker } from "@/components/authoring/people-picker";
import { RichTextField } from "@/components/authoring/rich-text-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createEvent } from "./actions";

/**
 * "Record an Event" entry point on the timeline. Captures a milestone — a
 * wedding, a Christmas, a move — with a fuzzy date (an exact day OR "summer
 * 1968"), where it happened, who was there, and the story. It lands in the
 * right year automatically.
 */
export function EventCreate() {
  return (
    <CreateFlow
      triggerLabel="Record an Event"
      title="Record an event"
      description="A milestone on the family timeline. A year is all that's required; add a story and the people who were there."
      action={createEvent}
      submitLabel="Add to Timeline"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="event-title">Title</Label>
        <Input
          id="event-title"
          name="title"
          required
          placeholder="e.g. Peggy &amp; Bill's wedding"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>When</Label>
        <FuzzyDateField
          name="date"
          circaPlaceholder="e.g. summer 1968, June 1972"
        />
        <p className="text-xs text-foreground-subtle">
          A year is required. Use an exact date if you know it, otherwise a phrase.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="event-location">Where</Label>
        <Input
          id="event-location"
          name="location"
          placeholder="e.g. Squam Lake, New Hampshire"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Who was there</Label>
        <PeoplePicker
          name="people"
          placeholder="Search family &amp; ancestors…"
          emptyHint="No one tagged yet."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="event-description">The story</Label>
        <RichTextField
          name="description"
          tone="salon"
          rows={5}
          ariaLabel="Event story"
          placeholder="What happened, and why it's remembered…"
        />
      </div>
    </CreateFlow>
  );
}
