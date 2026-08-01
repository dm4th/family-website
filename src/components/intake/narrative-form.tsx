"use client";

/**
 * One property narrative field (`guidelines` or `how_to`) offered as a
 * destination for extracted text.
 *
 * Lifted out of `note-review.tsx` when PRD 37's paste review needed the same
 * thing. It was already the most load-bearing piece of the review screens, and
 * a second copy would have been a second place for the append semantics to
 * drift.
 *
 * Where the property already has text in that field, the box opens with the
 * existing text *plus* the new lines appended, rather than offering a hidden
 * "append or replace" mode. What the member sees in the box is exactly what
 * will be saved, which is the only version of this that's safe to press Save on
 * without reading the small print — and it is also, for a pasted document, how
 * the old blob gets cleaned up: the member deletes it right there, in the same
 * box, as their own act.
 */

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormStatus } from "@/components/form-status";
import { ReviewField, ReviewSection } from "@/components/intake/review-shell";
import {
  PropertyCarryFields,
  useNotifyOnSave,
  type CarryableField,
  type IntakeProperty,
} from "@/components/intake/property-carry-fields";
import type { ExtractedField } from "@/lib/intake/schema";
import { updateProperty, type PropertyFormState } from "@/app/(app)/properties/[slug]/actions";

const propertyInitial: PropertyFormState = { status: "idle" };

export function NarrativeForm({
  property,
  canManage,
  field,
  sectionLabel,
  fieldLabel,
  proposed,
  blurb,
  onSaved,
  busy,
  rows = 8,
}: {
  property: IntakeProperty;
  canManage: boolean;
  field: "guidelines" | "how_to";
  sectionLabel: string;
  fieldLabel: string;
  proposed: ExtractedField;
  blurb: string;
  onSaved: () => void;
  busy: boolean;
  /** Taller for a pasted document, where the box holds a whole manual. */
  rows?: number;
}) {
  const action = updateProperty.bind(null, property.id);
  const [state, formAction, isPending] = useActionState(action, propertyInitial);
  const [dismissed, setDismissed] = useState(false);
  useNotifyOnSave(state.status === "saved", onSaved);

  // Read at render, so a sibling form's save (which refreshes the property
  // upstream) is reflected here rather than frozen at page load.
  const existing = property[field];

  // Nothing to offer if the source had nothing for this field.
  if (!proposed.value || dismissed) return null;

  if (state.status === "saved") {
    return (
      <ReviewSection label={sectionLabel}>
        <p className="text-base text-foreground">Saved to {property.name}.</p>
      </ReviewSection>
    );
  }

  const initial = existing
    ? `${existing.trimEnd()}\n\n${proposed.value}`
    : proposed.value;
  const inputId = `intake-${field}`;

  // Long enough that the old text is the bulk of the box, which is exactly when
  // the member needs telling that deleting it is theirs to do.
  const existingIsLarge = (existing?.length ?? 0) > 800;

  return (
    <ReviewSection label={sectionLabel}>
      <p className="text-base text-foreground-muted">{blurb}</p>
      {existing ? (
        <p className="text-sm text-foreground-subtle">
          {existingIsLarge
            ? "Your current text is included below the tidied version. Delete whatever the structured save has replaced, then save what's left. Nothing changes until you press Save."
            : "There are already notes here, so we’ve put the new lines underneath the ones you had. Nothing is lost. Edit the box however you like before saving."}
        </p>
      ) : null}
      <form action={formAction} className="flex flex-col gap-4">
        <PropertyCarryFields
          property={property}
          canManage={canManage}
          omit={[field as CarryableField]}
        />

        <ReviewField
          label={fieldLabel}
          htmlFor={inputId}
          confidence={proposed.confidence}
        >
          <Textarea
            id={inputId}
            name={field}
            rows={rows}
            disabled={isPending}
            defaultValue={initial}
          />
        </ReviewField>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="ghost" onClick={() => setDismissed(true)}>
            Not This One
          </Button>
          <div className="flex items-center gap-3">
            <FormStatus tone="error">
              {state.status === "error" ? state.message : null}
            </FormStatus>
            <Button type="submit" variant="outline" disabled={isPending || busy}>
              {isPending ? "Saving…" : `Save ${fieldLabel}`}
            </Button>
          </div>
        </div>
      </form>
    </ReviewSection>
  );
}
