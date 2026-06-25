"use client";

import { useActionState, useState } from "react";

import { ChipListField, RichTextField } from "@/components/authoring";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateProperty,
  type PropertyFormState,
} from "../actions";

const initial: PropertyFormState = { status: "idle" };

type PeakRange = { start: string; end: string };

export type PropertyEditValues = {
  id: string;
  name: string;
  location: string | null;
  address: string | null;
  description: string | null;
  how_to: string | null;
  guidelines: string | null;
  amenities: string[];
  status: string;
  max_guests: number | null;
  peak_period_ranges: PeakRange[];
};

export function PropertyEditForm({
  property,
  canChangeStatus,
}: {
  property: PropertyEditValues;
  canChangeStatus: boolean;
}) {
  const action = updateProperty.bind(null, property.id);
  const [state, formAction, isPending] = useActionState(action, initial);
  const [peakRanges, setPeakRanges] = useState<PeakRange[]>(
    property.peak_period_ranges ?? [],
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Field label="Name" htmlFor="name">
        <Input
          id="name"
          name="name"
          required
          defaultValue={property.name}
          autoComplete="off"
        />
      </Field>

      <Field label="Location" htmlFor="location">
        <Input
          id="location"
          name="location"
          defaultValue={property.location ?? ""}
          placeholder="e.g., Squam Lake, New Hampshire"
        />
      </Field>

      <Field label="Address" htmlFor="address">
        <Input
          id="address"
          name="address"
          defaultValue={property.address ?? ""}
        />
      </Field>

      <Field
        label="About"
        htmlFor="description"
        hint="A short overview of the place."
      >
        <RichTextField
          id="description"
          name="description"
          rows={4}
          defaultValue={property.description}
        />
      </Field>

      <Field
        label="How things work here"
        htmlFor="how_to"
        hint="Trash schedule, WiFi, quirks, boat/dock notes."
      >
        <RichTextField
          id="how_to"
          name="how_to"
          rows={8}
          defaultValue={property.how_to}
        />
      </Field>

      <Field
        label="House rules"
        htmlFor="guidelines"
        hint="House rules family members agree to follow."
      >
        <RichTextField
          id="guidelines"
          name="guidelines"
          rows={6}
          defaultValue={property.guidelines}
        />
      </Field>

      <Field
        label="Amenities"
        htmlFor="amenities"
        hint="Add what the place has — one per chip."
      >
        <ChipListField
          id="amenities"
          name="amenities"
          inputAriaLabel="Add an amenity"
          defaultItems={property.amenities}
          placeholder="e.g., Dock, Canoe, Wood stove"
          addLabel="Add amenity"
          emptyHint="No amenities listed yet."
        />
      </Field>

      {canChangeStatus && (
        <Field
          label="Status"
          htmlFor="status"
          hint="Site or property admins only. Inactive properties are hidden from the listing."
        >
          <select
            id="status"
            name="status"
            defaultValue={property.status}
            className="h-9 w-full max-w-[14rem] rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <option value="active">Active</option>
            <option value="maintenance">Maintenance</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
      )}

      {canChangeStatus && (
        <Field
          label="Max guests"
          htmlFor="max_guests"
          hint="Optional cap per booking. Leave blank for no limit."
        >
          <Input
            id="max_guests"
            name="max_guests"
            type="number"
            min={1}
            defaultValue={property.max_guests ?? ""}
            className="max-w-[10rem]"
          />
        </Field>
      )}

      {canChangeStatus && (
        <Field
          label="Peak periods"
          htmlFor="peak_period_ranges"
          hint="Recurring MM-DD windows that require admin approval each year. e.g., 07-01 → 08-31 for the summer."
        >
          <input
            type="hidden"
            name="peak_period_ranges"
            value={JSON.stringify(peakRanges)}
          />
          <PeakRangeEditor ranges={peakRanges} onChange={setPeakRanges} />
        </Field>
      )}

      <div className="mt-2 flex items-center justify-end gap-3 border-t border-border pt-5">
        {state.status === "saved" && (
          <p className="text-sm text-accent-operations">
            Saved. Logged to revisions.
          </p>
        )}
        {state.status === "error" && (
          <p className="text-sm text-destructive">{state.message}</p>
        )}
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function PeakRangeEditor({
  ranges,
  onChange,
}: {
  ranges: PeakRange[];
  onChange: (next: PeakRange[]) => void;
}) {
  function update(i: number, patch: Partial<PeakRange>) {
    onChange(ranges.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function remove(i: number) {
    onChange(ranges.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...ranges, { start: "", end: "" }]);
  }
  return (
    <div className="flex flex-col gap-2">
      {ranges.length === 0 && (
        <p className="text-xs italic text-foreground-subtle">
          No peak periods. All requests auto-approve if there&apos;s no conflict.
        </p>
      )}
      {ranges.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            placeholder="07-01"
            pattern="\d{2}-\d{2}"
            value={r.start}
            onChange={(e) => update(i, { start: e.target.value })}
            className="w-24"
          />
          <span className="text-foreground-subtle">→</span>
          <Input
            placeholder="08-31"
            pattern="\d{2}-\d{2}"
            value={r.end}
            onChange={(e) => update(i, { end: e.target.value })}
            className="w-24"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => remove(i)}
          >
            Remove
          </Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          Add peak period
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-foreground-muted">
        {label}
      </Label>
      {children}
      {hint && (
        <p className="text-xs text-foreground-subtle">{hint}</p>
      )}
    </div>
  );
}
