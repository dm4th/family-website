"use client";

import { useId } from "react";

import { FuzzyDateField, type FuzzyDate } from "@/components/authoring/fuzzy-date-field";
import { RichTextField } from "@/components/authoring/rich-text-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The current values of a person, for pre-filling the edit form. */
export type PersonDefaults = {
  displayName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  birthDate?: string | null;
  birthCirca?: string | null;
  deathDate?: string | null;
  deathCirca?: string | null;
  familyBranch?: string | null;
  bio?: string | null;
};

/** Build a FuzzyDateField default from an exact date or a circa phrase. */
function fuzzyDefault(date?: string | null, circa?: string | null): FuzzyDate {
  if (date) return { precision: "exact", date };
  if (circa && circa.trim()) return { precision: "circa", text: circa };
  return { precision: "none" };
}

/**
 * PersonFields — the shared field set for adding or editing a `people` row.
 * Rendered inside a CreateFlow, an InlineEditable, or the "new relative" branch
 * of AddRelative, so it's just the fields (no <form>, no submit button).
 *
 * A name is the only requirement; everything else — including dates — is
 * optional, because most ancestors are remembered only approximately. Dates use
 * the FuzzyDateField so "circa 1912" is a first-class answer.
 */
export function PersonFields({ defaults }: { defaults?: PersonDefaults }) {
  const uid = useId();

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-display`}>Name</Label>
        <Input
          id={`${uid}-display`}
          name="display_name"
          required
          defaultValue={defaults?.displayName ?? ""}
          placeholder="How they're known, e.g. Grandma Peggy"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-given`}>Given name</Label>
          <Input
            id={`${uid}-given`}
            name="given_name"
            defaultValue={defaults?.givenName ?? ""}
            placeholder="Margaret"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-family`}>Family name</Label>
          <Input
            id={`${uid}-family`}
            name="family_name"
            defaultValue={defaults?.familyName ?? ""}
            placeholder="Mathieson"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Born</Label>
        <FuzzyDateField
          name="birth"
          defaultValue={fuzzyDefault(defaults?.birthDate, defaults?.birthCirca)}
          circaPlaceholder="e.g. circa 1912, spring 1940"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Died</Label>
        <FuzzyDateField
          name="death"
          defaultValue={fuzzyDefault(defaults?.deathDate, defaults?.deathCirca)}
          circaPlaceholder="e.g. circa 1998"
        />
        <p className="text-xs text-foreground-subtle">
          Leave blank for someone living.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-branch`}>Family branch</Label>
        <Input
          id={`${uid}-branch`}
          name="family_branch"
          defaultValue={defaults?.familyBranch ?? ""}
          placeholder="e.g. Peter's family"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-bio`}>About</Label>
        <RichTextField
          name="bio"
          tone="salon"
          rows={5}
          defaultValue={defaults?.bio ?? ""}
          ariaLabel="About this person"
          placeholder="A few sentences about who they were, where they lived, what they're remembered for…"
        />
      </div>
    </>
  );
}
