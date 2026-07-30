"use client";

/**
 * Reminders on the property calendar (PRD 32, slice 3).
 *
 * Reminders sit next to bookings because that's where dates live, but they are
 * kept visually distinct throughout: bronze markers rather than filled bands on
 * the grid, and their own list here. "The house is occupied" and "a bill is due"
 * are different facts and must never be confused for one another.
 *
 * Adding one by hand is the baseline; Smart Intake fills the same fields in from
 * a photographed bill.
 */

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/confirm-button";
import { FormStatus } from "@/components/form-status";
import { Eyebrow } from "@/components/shell";
import {
  ReminderFields,
  type ReminderDefaults,
} from "@/components/reminders/reminder-fields";
import { useNotifyOnSave } from "@/lib/use-notify-on-save";
import {
  RECURRENCE_LABELS,
  formatDueDate,
  nextOccurrence,
  todayIso,
  type ReminderRecurrence,
} from "@/lib/reminders";
import {
  addPropertyReminder,
  deletePropertyReminder,
  updatePropertyReminder,
  type ReminderFormState,
} from "../../reminders/actions";

const initial: ReminderFormState = { status: "idle" };

export type ReminderRow = {
  id: string;
  title: string;
  notes: string | null;
  due_date: string;
  recurrence: ReminderRecurrence;
};

export function RemindersPanel({
  propertyId,
  propertySlug,
  reminders,
}: {
  propertyId: string;
  propertySlug: string;
  reminders: ReminderRow[];
}) {
  const [adding, setAdding] = useState(false);
  const today = todayIso();

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <div>
          <Eyebrow>Reminders</Eyebrow>
          <h3 className="font-display text-lg leading-tight text-foreground">
            Dates to Remember
          </h3>
        </div>
        {!adding && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAdding(true)}
          >
            Add a Reminder
          </Button>
        )}
      </div>

      {adding && (
        <div className="border-b border-border px-5 py-5 sm:px-6">
          <ReminderForm
            idPrefix="reminder-new"
            submitLabel="Save Reminder"
            action={addPropertyReminder.bind(null, propertyId, propertySlug)}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {reminders.length === 0 && !adding ? (
        <p className="px-5 py-6 text-sm italic text-foreground-subtle sm:px-6">
          Nothing on the books. Bills, insurance, and tax dates can live here.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {reminders.map((r) => (
            <ReminderRowItem
              key={r.id}
              reminder={r}
              propertySlug={propertySlug}
              today={today}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReminderRowItem({
  reminder,
  propertySlug,
  today,
}: {
  reminder: ReminderRow;
  propertySlug: string;
  today: string;
}) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();

  if (editing) {
    return (
      <li className="px-5 py-5 sm:px-6">
        <ReminderForm
          idPrefix={`reminder-${reminder.id}`}
          submitLabel="Save Changes"
          defaults={{
            title: reminder.title,
            notes: reminder.notes,
            dueDate: reminder.due_date,
            recurrence: reminder.recurrence,
          }}
          action={updatePropertyReminder.bind(
            null,
            reminder.id,
            propertySlug,
          )}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  // A repeating reminder shows its *next* date, not the one first entered —
  // "Aug 15, 2021" on a monthly water bill is technically the anchor and
  // practically useless.
  const next = nextOccurrence(reminder.due_date, reminder.recurrence, today);
  const overdue = !next && reminder.due_date < today;

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 sm:px-6">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">{reminder.title}</p>
        <p className="mt-1 text-xs text-foreground-subtle">
          {next ? formatDueDate(next) : formatDueDate(reminder.due_date)}
          {overdue ? " · past" : ""}
          {reminder.recurrence !== "none"
            ? ` · ${RECURRENCE_LABELS[reminder.recurrence].toLowerCase()}`
            : ""}
        </p>
        {reminder.notes && (
          <p className="mt-2 text-xs italic text-foreground-muted">
            {reminder.notes}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(true)}
        >
          Edit
        </Button>
        <ConfirmButton
          triggerVariant="ghost"
          triggerSize="sm"
          title="Remove this reminder?"
          description={`"${reminder.title}" will stop appearing on the calendar. You can add it again later.`}
          confirmLabel="Remove Reminder"
          cancelLabel="Keep It"
          pendingLabel="Removing…"
          destructive
          successMessage="The reminder was removed."
          errorTitle="Couldn't remove this reminder"
          onConfirm={async () => {
            await deletePropertyReminder(reminder.id, propertySlug);
            router.refresh();
          }}
        >
          Remove
        </ConfirmButton>
      </div>
    </li>
  );
}

function ReminderForm({
  idPrefix,
  submitLabel,
  defaults,
  action,
  onDone,
  onCancel,
}: {
  idPrefix: string;
  submitLabel: string;
  defaults?: ReminderDefaults;
  action: (
    prev: ReminderFormState,
    formData: FormData,
  ) => Promise<ReminderFormState>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [state, formAction, isPending] = useActionState(action, initial);
  const router = useRouter();

  // The action already revalidated on the server; this pulls the new list into
  // the open page and closes the form. Once, in an effect — doing it inline
  // during render is a side effect React is free to run twice.
  useNotifyOnSave(state.status === "saved", () => {
    router.refresh();
    onDone();
  });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <ReminderFields
        idPrefix={idPrefix}
        defaults={defaults}
        disabled={isPending}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <div className="flex items-center gap-3">
          <FormStatus tone="error">
            {state.status === "error" ? state.message : null}
          </FormStatus>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
