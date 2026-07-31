"use client";

/**
 * Slice 3's review surface: due dates read off a bill, offered as reminders
 * (PRD 32).
 *
 * Same posture as slices 1 and 2. Each suggestion is its own form, saving
 * through the unchanged, already-gated `addPropertyReminder`; dismissing one
 * writes nothing; nothing saves until a Save button is pressed.
 *
 * The date gets the emphasis here, because it is the field where a wrong read is
 * both most likely and least visible. A misread vendor name looks wrong on the
 * page. "Due the 18th" when the bill says the 13th looks perfectly fine.
 */

import { useActionState, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/form-status";
import { ReviewSection } from "@/components/intake/review-shell";
import { ReminderFields } from "@/components/reminders/reminder-fields";
import {
  useNotifyOnSave,
  type IntakeProperty,
} from "@/components/intake/property-carry-fields";
import type { CalendarExtraction, SuggestedReminder } from "@/lib/intake/schema";
import { RECURRENCE_LABELS, formatDueDate, todayIso } from "@/lib/reminders";
import {
  addPropertyReminder,
  type ReminderFormState,
} from "../../reminders/actions";

const initial: ReminderFormState = { status: "idle" };

export function CalendarReview({
  property,
  extraction,
  source = "document",
  onStartOver,
  onItemSaved,
}: {
  property: IntakeProperty;
  extraction: CalendarExtraction;
  /** Where the dates came from, which is all that changes in the wording. */
  source?: "document" | "voice";
  onStartOver: () => void;
  /** Fired once per saved reminder, for the progress count (PRD 34). */
  onItemSaved?: () => void;
}) {
  const voice = source === "voice";

  if (extraction.reminders.length === 0) {
    return (
      <ReviewSection label="No dates found">
        <p className="text-base text-foreground">
          {voice
            ? "You didn't name a day, so there's nothing to put on the calendar. We'd rather tell you that than guess at one."
            : "We didn't find a due date on that document. Some statements don't set one, and we'd rather tell you that than put a made-up date on the calendar."}
        </p>
        <p className="text-sm text-foreground-subtle">
          You can still add a reminder by hand from the property&rsquo;s calendar
          page.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Button type="button" variant="outline" onClick={onStartOver}>
            Read Another Document
          </Button>
          <Link
            href={`/properties/${property.slug}/calendar`}
            className="text-base text-foreground underline underline-offset-4"
          >
            Go to the calendar
          </Link>
        </div>
      </ReviewSection>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-base text-foreground-muted">
        {extraction.reminders.length === 1
          ? voice
            ? "Here's the date we worked out from what you said. Check it before you save."
            : "Here's the date we found. Check it against the bill before you save."
          : `We found ${extraction.reminders.length} dates. Each one saves on its own, so you can take the ones you want.`}
      </p>

      {extraction.reminders.map((reminder, index) => (
        <SuggestedReminderForm
          // A fixed list from one read, never reordered, so the index is stable.
          key={index}
          property={property}
          reminder={reminder}
          index={index}
          voice={voice}
          onSaved={onItemSaved}
        />
      ))}

      <div>
        <Button type="button" variant="ghost" onClick={onStartOver}>
          {voice ? "Say Something Else" : "Read Another Document"}
        </Button>
      </div>
    </div>
  );
}

/**
 * One proposed reminder.
 *
 * The amount is folded into the notes box rather than shown in a field of its
 * own, because there is nowhere else for it to go: a reminder has no money
 * column, deliberately (PRD 32 keeps payments out of scope). Folding it in at
 * the default means what the member reads in the box is exactly what gets saved,
 * with no hidden assembly step between the screen and the row.
 */
function SuggestedReminderForm({
  property,
  reminder,
  index,
  voice,
  onSaved,
}: {
  property: IntakeProperty;
  reminder: SuggestedReminder;
  index: number;
  voice: boolean;
  onSaved?: () => void;
}) {
  const action = addPropertyReminder.bind(null, property.id, property.slug);
  const [state, formAction, isPending] = useActionState(action, initial);
  const [dismissed, setDismissed] = useState(false);
  useNotifyOnSave(state.status === "saved", () => onSaved?.());

  if (dismissed) return null;

  const what = reminder.title ?? "this bill";

  if (state.status === "saved") {
    // Named from what the server actually wrote, never from `reminder` (the
    // model's proposal). Correcting a misread date is the whole reason this
    // screen exists, and a confirmation built from the suggestion would happily
    // read back the date the member just fixed.
    const savedTitle = state.saved?.title ?? what;
    const savedDate = state.saved?.dueDate ?? reminder.dueDate;
    return (
      <ReviewSection label="Reminder">
        <p className="text-base text-foreground">
          Saved. {savedTitle} is on {property.name}&rsquo;s calendar for{" "}
          {formatDueDate(savedDate)}.
        </p>
        <div>
          <Link
            href={`/properties/${property.slug}/calendar`}
            className="text-base text-foreground underline underline-offset-4"
          >
            See it on the calendar
          </Link>
        </div>
      </ReviewSection>
    );
  }

  const notesDefault = [reminder.amount, reminder.notes]
    .filter(Boolean)
    .join(" · ");

  return (
    <ReviewSection label="Reminder found on this document">
      <form action={formAction} className="flex flex-col gap-4">
        <ReminderFields
          idPrefix={`intake-reminder-${index}`}
          disabled={isPending}
          defaults={{
            title: reminder.title,
            dueDate: reminder.dueDate,
            recurrence: reminder.recurrence,
            notes: notesDefault || null,
          }}
          slots={{
            /*
              Two different warnings, both earned from the eval (36 extractions
              across six documents and three photo qualities, written up in
              evals/intake/results-calendar-2026-07-30.md):

              * Confidence IS informative on this intent, unlike on slice 2's
                handwriting, where the model answered "high" to everything.
                Here every single error landed on a "medium" row and all 36
                "high" rows were right. So gating on it is meaningful rather
                than decorative.

              * The past-date line targets the one fabrication the eval found.
                On a degraded photo of an invoice printing "Due: 08/14" with the
                year only in the statement date, the model returned 2025-08-14
                instead of 2026. That is the worst shape a date error can take:
                the day and month are right, so it reads as correct, and the
                wrong year is the one part nobody re-checks. A past due date is
                sometimes legitimate (entering something already overdue), so it
                is flagged loudly and never dropped or silently corrected.
            */
            dueDate: (
              <>
                {/*
                  Speech is the one input where the date on the form is a
                  *resolution* rather than a copy: "the fifteenth" has to be
                  turned into a real day, and getting the month or the year wrong
                  is invisible once it's a date box. Quoting the words back is
                  what makes that step checkable — the member confirms our
                  arithmetic, not just our reading.
                */}
                {voice && reminder.spokenAs && (
                  <p className="text-sm text-foreground-subtle">
                    You said &ldquo;{reminder.spokenAs}&rdquo;. Check that
                    we&rsquo;ve worked out the right day.
                  </p>
                )}
                {reminder.dueDate < todayIso() && (
                  <p className="text-sm font-medium text-accent-bronze">
                    This date has already passed. If the bill only printed the
                    day and month, check that the year is right.
                  </p>
                )}
                <p className="text-sm text-accent-bronze">
                  {reminder.confidence === "high"
                    ? voice
                      ? "Worth a glance before you save."
                      : "Worth a glance against the bill."
                    : voice
                      ? "We weren't sure about this date. Please check it."
                      : "We weren't sure about this date. Please check it against the bill."}
                </p>
              </>
            ),
            recurrence:
              reminder.recurrence !== "none" ? (
                <p className="text-sm text-foreground-subtle">
                  {voice ? "You said this repeats " : "The document says this repeats "}
                  {RECURRENCE_LABELS[reminder.recurrence].toLowerCase()}. Change
                  it to &ldquo;Just once&rdquo; if that&rsquo;s not right.
                </p>
              ) : undefined,
          }}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setDismissed(true)}
          >
            Not This One
          </Button>
          <div className="flex items-center gap-3">
            <FormStatus tone="error">
              {state.status === "error" ? state.message : null}
            </FormStatus>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save Reminder"}
            </Button>
          </div>
        </div>
      </form>
    </ReviewSection>
  );
}
