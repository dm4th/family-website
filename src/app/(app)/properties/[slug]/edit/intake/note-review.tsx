"use client";

/**
 * Slice 2's review surface: a handwritten note, read back and routed by the
 * member (PRD 32).
 *
 * The shape of this screen follows from one fact — handwriting OCR is the least
 * reliable thing this feature does. So the transcription is the hero, not a
 * detail behind a disclosure: it sits at the top, in a large editable box, next
 * to a link back to the original photo. Everything below it is *offered*, and
 * every destination the member picks saves through its own existing gated
 * action, separately, with its own revision.
 *
 * Nothing on this page auto-routes and nothing saves until a Save button is
 * pressed.
 */

import { useActionState, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormStatus } from "@/components/form-status";
import { ReviewField, ReviewSection } from "@/components/intake/review-shell";
import {
  PropertyCarryFields,
  type CarryableField,
  type IntakeProperty,
} from "@/components/intake/property-carry-fields";
import type {
  ExtractedField,
  NoteExtraction,
  SuggestedContact,
} from "@/lib/intake/schema";
import {
  addPropertyContact,
  type ContactFormState,
} from "../../contacts/actions";
import { updateProperty, type PropertyFormState } from "../../actions";

const contactInitial: ContactFormState = { status: "idle" };
const propertyInitial: PropertyFormState = { status: "idle" };

export function NoteReview({
  property,
  extraction,
  canManage,
  onStartOver,
}: {
  property: IntakeProperty;
  extraction: NoteExtraction;
  canManage: boolean;
  onStartOver: () => void;
}) {
  const { transcription, suggestedGuidelines, suggestedHowTo } = extraction;

  const nothingFound =
    !transcription.value &&
    !suggestedGuidelines.value &&
    !suggestedHowTo.value &&
    extraction.suggestedContacts.length === 0;

  if (nothingFound) {
    return (
      <ReviewSection label="Nothing readable">
        <p className="text-base text-foreground">
          We couldn&rsquo;t make out anything on that photo. A brighter room, or
          holding the camera square over the page, usually does it.
        </p>
        <div>
          <Button type="button" variant="outline" onClick={onStartOver}>
            Try Another Photo
          </Button>
        </div>
      </ReviewSection>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <TranscriptionPanel transcription={transcription} />

      <p className="text-base text-foreground-muted">
        Below are the places this note could go. Each one saves on its own, so
        you can take just the parts you want and ignore the rest.
      </p>

      <NarrativeForm
        property={property}
        canManage={canManage}
        field="guidelines"
        sectionLabel="House guidelines"
        fieldLabel="Guidelines"
        proposed={suggestedGuidelines}
        blurb="Rules and expectations for people staying."
      />

      <NarrativeForm
        property={property}
        canManage={canManage}
        field="how_to"
        sectionLabel="How things work"
        fieldLabel="How to"
        proposed={suggestedHowTo}
        blurb="Practical instructions: where the water shut-off is, gate codes, heating."
      />

      {extraction.suggestedContacts.map((contact, index) => (
        <SuggestedContactForm
          // Suggestions are a fixed list from one read and are never reordered,
          // so the index is a stable identity here.
          key={index}
          property={property}
          contact={contact}
          index={index}
        />
      ))}

      <div>
        <Button type="button" variant="ghost" onClick={onStartOver}>
          Read Another Note
        </Button>
      </div>
    </div>
  );
}

/**
 * The transcription, shown before any destination. It isn't a form: it's the
 * member's reference while they decide where things go, and a place to read our
 * work against the photo. Selectable so they can copy a line out by hand if
 * they'd rather.
 */
function TranscriptionPanel({
  transcription,
}: {
  transcription: ExtractedField;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-surface/60 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg leading-tight text-foreground">
          What the note says
        </h3>
        {/*
          Unconditional, not confidence-driven. Measured across 30 handwriting
          extractions the model reported "high" on every single field, including
          on a real handwritten document it read four different ways across
          runs. On this intent confidence doesn't discriminate, so the standing
          warning can't be gated on it — a flag that never fires is worse than
          no flag, because its absence reads as reassurance.
        */}
        <span className="text-sm font-medium text-accent-bronze">
          Please check this against the photo
        </span>
      </div>
      <p className="text-sm text-foreground-subtle">
        This is our best read of the handwriting, not a perfect copy. Anywhere it
        shows [?] we couldn&rsquo;t make out the word.
      </p>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-surface p-4 text-base leading-relaxed text-foreground">
        {transcription.value ?? "We couldn't read any text on this photo."}
      </pre>
    </section>
  );
}

/**
 * One property narrative field (`guidelines` or `how_to`) as a destination.
 *
 * Where the property already has text in that field, the box opens with the
 * existing text *plus* the new lines appended, rather than offering a hidden
 * "append or replace" mode. What the member sees in the box is exactly what
 * will be saved, which is the only version of this that's safe to press Save on
 * without reading the small print.
 */
function NarrativeForm({
  property,
  canManage,
  field,
  sectionLabel,
  fieldLabel,
  proposed,
  blurb,
}: {
  property: IntakeProperty;
  canManage: boolean;
  field: "guidelines" | "how_to";
  sectionLabel: string;
  fieldLabel: string;
  proposed: ExtractedField;
  blurb: string;
}) {
  const action = updateProperty.bind(null, property.id);
  const [state, formAction, isPending] = useActionState(action, propertyInitial);
  const [dismissed, setDismissed] = useState(false);

  const existing = property[field];

  // Nothing to offer if the note had nothing for this field.
  if (!proposed.value || dismissed) return null;

  if (state.status === "saved") {
    return (
      <ReviewSection label={sectionLabel}>
        <p className="text-base text-foreground">
          Saved to {property.name}.
        </p>
      </ReviewSection>
    );
  }

  const initial = existing
    ? `${existing.trimEnd()}\n\n${proposed.value}`
    : proposed.value;
  const inputId = `intake-${field}`;

  return (
    <ReviewSection label={sectionLabel}>
      <p className="text-base text-foreground-muted">{blurb}</p>
      {existing ? (
        <p className="text-sm text-foreground-subtle">
          There are already notes here, so we&rsquo;ve put the new lines
          underneath the ones you had. Nothing is lost. Edit the box however you
          like before saving.
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
            rows={8}
            disabled={isPending}
            defaultValue={initial}
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
            <Button type="submit" variant="outline" disabled={isPending}>
              {isPending ? "Saving…" : `Save ${fieldLabel}`}
            </Button>
          </div>
        </div>
      </form>
    </ReviewSection>
  );
}

/**
 * A person the note named, offered as a pre-filled contact through the same
 * unchanged `addPropertyContact` action slice 1 uses. Offered, never assumed:
 * dismissing it writes nothing.
 */
function SuggestedContactForm({
  property,
  contact,
  index,
}: {
  property: IntakeProperty;
  contact: SuggestedContact;
  index: number;
}) {
  const action = addPropertyContact.bind(null, property.id, property.slug);
  const [state, formAction, isPending] = useActionState(action, contactInitial);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const who = contact.name ?? contact.label ?? "this contact";

  if (state.status === "saved") {
    return (
      <ReviewSection label="Contact">
        <p className="text-base text-foreground">
          Saved. {who} is now a contact on {property.name}.
        </p>
        <div>
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

  const id = (field: string) => `intake-contact-${index}-${field}`;

  return (
    <ReviewSection label="Contact found in the note">
      <p className="text-base text-foreground-muted">
        The note mentions {who}. Save them as a contact on {property.name}?
      </p>
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ReviewField
            label="Label"
            htmlFor={id("label")}
            confidence={contact.confidence}
            hint="What kind of contact this is."
          >
            <Input
              id={id("label")}
              name="label"
              required
              disabled={isPending}
              defaultValue={contact.label ?? ""}
              placeholder="Plumber / Caretaker / Snow removal…"
            />
          </ReviewField>
          <ReviewField
            label="Name"
            htmlFor={id("name")}
            confidence={contact.confidence}
          >
            <Input
              id={id("name")}
              name="name"
              disabled={isPending}
              defaultValue={contact.name ?? ""}
            />
          </ReviewField>
          <ReviewField
            label="Phone"
            htmlFor={id("phone")}
            confidence={contact.confidence}
            hint="Handwritten numbers are easy to misread. Worth checking digit by digit."
          >
            <Input
              id={id("phone")}
              name="phone"
              type="tel"
              disabled={isPending}
              defaultValue={contact.phone ?? ""}
            />
          </ReviewField>
          <ReviewField
            label="Email"
            htmlFor={id("email")}
            confidence={contact.confidence}
          >
            <Input
              id={id("email")}
              name="email"
              type="email"
              disabled={isPending}
              defaultValue={contact.email ?? ""}
            />
          </ReviewField>
          <ReviewField
            label="Notes"
            htmlFor={id("notes")}
            confidence={contact.confidence}
            className="sm:col-span-2"
          >
            <Input
              id={id("notes")}
              name="notes"
              disabled={isPending}
              defaultValue={contact.notes ?? ""}
            />
          </ReviewField>
        </div>

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
              {isPending ? "Saving…" : "Save Contact"}
            </Button>
          </div>
        </div>
      </form>
    </ReviewSection>
  );
}
