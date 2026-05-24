"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateProperty,
  type PropertyFormState,
} from "../actions";

const initial: PropertyFormState = { status: "idle" };

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

  return (
    <form action={formAction} className="space-y-6">
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
        hint="Markdown supported. A short overview of the place."
      >
        <Textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={property.description ?? ""}
        />
      </Field>

      <Field
        label="How things work here"
        htmlFor="how_to"
        hint="Trash schedule, WiFi, quirks, boat/dock notes. Markdown supported."
      >
        <Textarea
          id="how_to"
          name="how_to"
          rows={8}
          defaultValue={property.how_to ?? ""}
        />
      </Field>

      <Field
        label="House rules"
        htmlFor="guidelines"
        hint="House rules family members agree to follow. Markdown supported."
      >
        <Textarea
          id="guidelines"
          name="guidelines"
          rows={6}
          defaultValue={property.guidelines ?? ""}
        />
      </Field>

      <Field
        label="Amenities"
        htmlFor="amenities"
        hint="One amenity per line."
      >
        <Textarea
          id="amenities"
          name="amenities"
          rows={5}
          defaultValue={property.amenities.join("\n")}
          placeholder="Dock&#10;Canoe&#10;Wood stove"
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
            className="h-9 w-full max-w-[14rem] rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            <option value="active">Active</option>
            <option value="maintenance">Maintenance</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>

      {state.status === "saved" && (
        <p className="text-sm text-emerald-600">
          Saved. Every change is logged.
        </p>
      )}
      {state.status === "error" && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
    </form>
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:border-ring"
    />
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
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
