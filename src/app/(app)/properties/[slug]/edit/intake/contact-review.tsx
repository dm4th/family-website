"use client";

/**
 * Slice 1's review surface: a vendor contact read off a bill, plus the service
 * address when the bill clearly shows one and the property doesn't have one yet.
 *
 * Both save through their existing, unchanged gated actions (PRD 27). Extracted
 * from `intake-flow.tsx` in slice 2 so the flow file holds the pipeline and each
 * intent owns its own review form.
 */

import { useActionState, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormStatus } from "@/components/form-status";
import { ReviewField, ReviewSection } from "@/components/intake/review-shell";
import {
  PropertyCarryFields,
  useNotifyOnSave,
  type IntakeProperty,
} from "@/components/intake/property-carry-fields";
import type { ContactExtraction } from "@/lib/intake/schema";
import {
  addPropertyContact,
  type ContactFormState,
} from "../../contacts/actions";
import { updateProperty, type PropertyFormState } from "../../actions";

const contactInitial: ContactFormState = { status: "idle" };
const propertyInitial: PropertyFormState = { status: "idle" };

export function ContactReview({
  property,
  extraction,
  canManage,
  onStartOver,
  onPropertySaved,
  propertyBusy,
}: {
  property: IntakeProperty;
  extraction: ContactExtraction;
  canManage: boolean;
  onStartOver: () => void;
  /** Fired after any write to the property, so sibling forms re-read it. */
  onPropertySaved: () => void;
  /** True while that re-read is in flight; holds the other property forms. */
  propertyBusy: boolean;
}) {
  return (
    <>
      <ContactReviewForm
        property={property}
        extraction={extraction}
        onStartOver={onStartOver}
      />
      <AddressReviewForm
        property={property}
        extraction={extraction}
        canManage={canManage}
        onSaved={onPropertySaved}
        busy={propertyBusy}
      />
    </>
  );
}

function ContactReviewForm({
  property,
  extraction,
  onStartOver,
}: {
  property: IntakeProperty;
  extraction: ContactExtraction;
  onStartOver: () => void;
}) {
  // The unchanged, already-gated add action (PRD 27). Intake only supplies the
  // initial values in the fields below.
  const action = addPropertyContact.bind(null, property.id, property.slug);
  const [state, formAction, isPending] = useActionState(action, contactInitial);

  const { fields } = extraction;

  if (state.status === "saved") {
    return (
      <ReviewSection label="Contact">
        <p className="text-base text-foreground">
          Saved. The contact is now on {property.name}.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Button type="button" variant="outline" onClick={onStartOver}>
            Read Another Document
          </Button>
          <Link
            href={`/properties/${property.slug}/edit`}
            className="text-base text-foreground underline underline-offset-4"
          >
            Back to editing
          </Link>
        </div>
      </ReviewSection>
    );
  }

  return (
    <ReviewSection label="Contact">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ReviewField
            label="Label"
            htmlFor="intake-label"
            confidence={fields.label.confidence}
            hint="What kind of contact this is."
          >
            <Input
              id="intake-label"
              name="label"
              required
              disabled={isPending}
              defaultValue={fields.label.value ?? ""}
              placeholder="Electric utility / Insurance / Plumber…"
            />
          </ReviewField>
          <ReviewField
            label="Name"
            htmlFor="intake-name"
            confidence={fields.name.confidence}
          >
            <Input
              id="intake-name"
              name="name"
              disabled={isPending}
              defaultValue={fields.name.value ?? ""}
            />
          </ReviewField>
          <ReviewField
            label="Phone"
            htmlFor="intake-phone"
            confidence={fields.phone.confidence}
          >
            <Input
              id="intake-phone"
              name="phone"
              type="tel"
              disabled={isPending}
              defaultValue={fields.phone.value ?? ""}
            />
          </ReviewField>
          <ReviewField
            label="Email"
            htmlFor="intake-email"
            confidence={fields.email.confidence}
          >
            <Input
              id="intake-email"
              name="email"
              type="email"
              disabled={isPending}
              defaultValue={fields.email.value ?? ""}
            />
          </ReviewField>
          <ReviewField
            label="Notes"
            htmlFor="intake-notes"
            confidence={fields.notes.confidence}
            className="sm:col-span-2"
            hint="Account number, billing period, amount due."
          >
            <Input
              id="intake-notes"
              name="notes"
              disabled={isPending}
              defaultValue={fields.notes.value ?? ""}
            />
          </ReviewField>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="ghost" onClick={onStartOver}>
            Start Over
          </Button>
          <div className="flex items-center gap-3">
            <FormStatus tone="error">
              {state.status === "error" ? state.message : null}
            </FormStatus>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save Contact"}
            </Button>
          </div>
        </div>
      </form>
    </ReviewSection>
  );
}

/**
 * The secondary target: fill in the property's address when the bill clearly
 * shows a service address and we don't have one yet. Offered, never assumed.
 *
 * `updateProperty` writes every field it reads, so the fields the member isn't
 * editing here ride along via `PropertyCarryFields` — see that component for why
 * the carry set is what it is.
 */
function AddressReviewForm({
  property,
  extraction,
  canManage,
  onSaved,
  busy,
}: {
  property: IntakeProperty;
  extraction: ContactExtraction;
  canManage: boolean;
  onSaved: () => void;
  busy: boolean;
}) {
  const action = updateProperty.bind(null, property.id);
  const [state, formAction, isPending] = useActionState(action, propertyInitial);
  const [dismissed, setDismissed] = useState(false);
  useNotifyOnSave(state.status === "saved", onSaved);

  const proposed = extraction.fields.address;

  // Nothing to offer if the bill didn't show an address, or if this property
  // already has one. We never overwrite an address a person entered.
  if (!proposed.value || property.address || dismissed) return null;

  if (state.status === "saved") {
    return (
      <ReviewSection label="Property address">
        <p className="text-base text-foreground">
          Saved. {property.name} now has an address.
        </p>
      </ReviewSection>
    );
  }

  return (
    <ReviewSection label="Property address">
      <p className="text-base text-foreground-muted">
        This property doesn&rsquo;t have an address yet, and the document seems to
        show one. Save it?
      </p>
      <form action={formAction} className="flex flex-col gap-4">
        <PropertyCarryFields
          property={property}
          canManage={canManage}
          omit={["address"]}
        />

        <ReviewField
          label="Address"
          htmlFor="intake-address"
          confidence={proposed.confidence}
        >
          <Input
            id="intake-address"
            name="address"
            disabled={isPending}
            defaultValue={proposed.value}
          />
        </ReviewField>

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
            <Button type="submit" variant="outline" disabled={isPending || busy}>
              {isPending ? "Saving…" : "Save Address"}
            </Button>
          </div>
        </div>
      </form>
    </ReviewSection>
  );
}
