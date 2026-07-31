"use client";

/**
 * The editable fields of a reminder, in one place (PRD 32, slice 3).
 *
 * Three surfaces render these: adding a reminder by hand on the property
 * calendar, editing one, and confirming one that Smart Intake read off a bill.
 * They share this component so the intake version is literally the same form
 * with the boxes already filled in — which is the whole promise of the feature,
 * and also means a field can't be validated one way when typed and another way
 * when pre-filled.
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  RECURRENCE_LABELS,
  RECURRENCE_VALUES,
  type ReminderRecurrence,
} from "@/lib/reminders";

const selectClass =
  "rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";

export type ReminderDefaults = {
  title?: string | null;
  notes?: string | null;
  dueDate?: string | null;
  recurrence?: ReminderRecurrence | null;
};

export function ReminderFields({
  idPrefix,
  defaults,
  disabled,
  /** Rendered under a field, used by intake to flag a low-confidence read. */
  slots,
}: {
  /** Namespaces the input ids so two of these can sit on one page. */
  idPrefix: string;
  defaults?: ReminderDefaults;
  disabled?: boolean;
  slots?: Partial<Record<"title" | "dueDate" | "recurrence" | "notes", React.ReactNode>>;
}) {
  const id = (field: string) => `${idPrefix}-${field}`;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor={id("title")}>What is it</Label>
        <Input
          id={id("title")}
          name="title"
          required
          disabled={disabled}
          defaultValue={defaults?.title ?? ""}
          placeholder="Water bill, insurance premium, property tax…"
        />
        {slots?.title}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("due_date")}>Date it&rsquo;s due</Label>
        <Input
          id={id("due_date")}
          name="due_date"
          type="date"
          required
          disabled={disabled}
          defaultValue={defaults?.dueDate ?? ""}
        />
        {slots?.dueDate}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("recurrence")}>Does it repeat</Label>
        <select
          id={id("recurrence")}
          name="recurrence"
          disabled={disabled}
          defaultValue={defaults?.recurrence ?? "none"}
          className={selectClass}
        >
          {RECURRENCE_VALUES.map((value) => (
            <option key={value} value={value}>
              {RECURRENCE_LABELS[value]}
            </option>
          ))}
        </select>
        {slots?.recurrence}
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor={id("notes")}>Notes (optional)</Label>
        <Textarea
          id={id("notes")}
          name="notes"
          rows={3}
          disabled={disabled}
          defaultValue={defaults?.notes ?? ""}
          placeholder="Amount, account number, who to call."
        />
        {slots?.notes}
      </div>
    </div>
  );
}
