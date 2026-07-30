"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormStatus } from "@/components/form-status";
import {
  ReviewField,
  ReviewSection,
  ReviewShell,
} from "@/components/intake/review-shell";
import { createClient } from "@/lib/supabase/client";
import { prepareImageForUpload } from "@/lib/image-resize";
import {
  INTAKE_BUCKET,
  INTAKE_MAX_DIMENSION,
  MAX_INTAKE_BYTES,
  generateIntakePath,
  isAllowedIntakeMime,
  type ContactExtraction,
} from "@/lib/intake/schema";
import { extractIntake } from "./actions";
import {
  addPropertyContact,
  type ContactFormState,
} from "../../contacts/actions";
import { updateProperty, type PropertyFormState } from "../../actions";

const MAX_MB = Math.round(MAX_INTAKE_BYTES / 1024 / 1024);

export type IntakeProperty = {
  id: string;
  slug: string;
  name: string;
  location: string | null;
  address: string | null;
  description: string | null;
  how_to: string | null;
  guidelines: string | null;
  amenities: string[];
  status: string;
  max_guests: number | null;
};

type Phase =
  | { name: "idle" }
  | { name: "working"; message: string }
  | { name: "error"; message: string }
  | { name: "review"; extraction: ContactExtraction };

export function IntakeFlow({
  property,
  canManage,
}: {
  property: IntakeProperty;
  canManage: boolean;
}) {
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    if (file.size > MAX_INTAKE_BYTES) {
      setPhase({
        name: "error",
        message: `That file is larger than ${MAX_MB}MB. Try taking the photo again at a smaller size.`,
      });
      return;
    }
    if (!isAllowedIntakeMime(file.type)) {
      setPhase({
        name: "error",
        message:
          "We can read photos (JPG, PNG) and PDFs. That file is a different kind.",
      });
      return;
    }

    setPhase({ name: "working", message: "Uploading your document…" });

    try {
      const isPdf = file.type.toLowerCase() === "application/pdf";

      // Photos get downscaled in the browser first (same helper the photo
      // archive uses). A 9MB phone original becomes a small JPEG, which the
      // model reads just as well, uploads far faster on a home connection, and
      // costs meaningfully less to read. No thumbnail: nothing renders these
      // in a grid.
      const prepared = isPdf
        ? null
        : await prepareImageForUpload(file, {
            maxEdge: INTAKE_MAX_DIMENSION,
            withThumb: false,
          });
      const body = prepared ? prepared.display : file;
      const contentType = prepared ? prepared.contentType : "application/pdf";
      const storagePath = generateIntakePath(isPdf ? "bill.pdf" : "bill.jpg");

      // Direct browser → Storage upload, bypassing the Server Action body limit
      // that breaks file uploads in production.
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(INTAKE_BUCKET)
        .upload(storagePath, body, { contentType, upsert: false });
      if (uploadError) {
        setPhase({
          name: "error",
          message: `We couldn't upload that file: ${uploadError.message}`,
        });
        return;
      }

      setPhase({ name: "working", message: "Reading your document…" });

      const result = await extractIntake(property.id, storagePath);
      if (result.status === "error") {
        setPhase({ name: "error", message: result.message });
        return;
      }
      setPhase({ name: "review", extraction: result.extraction });
    } catch (error) {
      setPhase({
        name: "error",
        message:
          error instanceof Error
            ? `Something went wrong: ${error.message}`
            : "Something went wrong. Please try again.",
      });
    }
  }

  if (phase.name === "review") {
    return (
      <ReviewShell
        title="Here's what we read"
        description="These are our best read of your document. Correct anything that looks wrong, then save."
        rawText={phase.extraction.rawText}
      >
        <ContactReviewForm
          property={property}
          extraction={phase.extraction}
          onStartOver={() => setPhase({ name: "idle" })}
        />
        <AddressReviewForm
          property={property}
          extraction={phase.extraction}
          canManage={canManage}
        />
      </ReviewShell>
    );
  }

  const busy = phase.name === "working";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="font-display text-xl leading-tight text-foreground">
          Add a contact from a bill
        </h2>
        <p className="text-base text-foreground-muted">
          Take a photo of a utility bill, an insurance statement, or a tax
          notice. We&rsquo;ll read the company, phone number, and account number off
          it and show them to you to check. Nothing is saved until you press
          Save.
        </p>
      </header>

      <div className="rounded-md border border-dashed border-accent-bronze/40 bg-surface/60 px-5 py-8 text-center">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
        <div className="flex flex-col items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Working…" : "Choose a Photo or PDF"}
          </Button>
          <p className="text-sm text-foreground-subtle">
            JPG, PNG, or PDF · up to {MAX_MB}MB
          </p>
        </div>
      </div>

      <FormStatus tone={phase.name === "error" ? "error" : "info"}>
        {phase.name === "error"
          ? phase.message
          : phase.name === "working"
            ? phase.message
            : null}
      </FormStatus>
    </div>
  );
}

const contactInitial: ContactFormState = { status: "idle" };

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

const propertyInitial: PropertyFormState = { status: "idle" };

/**
 * The secondary target: fill in the property's address when the bill clearly
 * shows a service address and we don't have one yet. Offered, never assumed.
 *
 * `updateProperty` takes the whole property form and writes every field it
 * reads, so the fields the member isn't editing here ride along as hidden
 * inputs carrying their current values. Getting that wrong would blank a
 * description on an address save, so the set below tracks the action's reads
 * exactly: `peak_period_ranges` is genuinely optional (the action preserves it
 * when absent), while `status` and `max_guests` are only preserved for members
 * who can't change them, which is why they're sent when `canManage` is true.
 */
function AddressReviewForm({
  property,
  extraction,
  canManage,
}: {
  property: IntakeProperty;
  extraction: ContactExtraction;
  canManage: boolean;
}) {
  const action = updateProperty.bind(null, property.id);
  const [state, formAction, isPending] = useActionState(action, propertyInitial);
  const [dismissed, setDismissed] = useState(false);

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
        <input type="hidden" name="name" value={property.name} />
        <input type="hidden" name="location" value={property.location ?? ""} />
        <input
          type="hidden"
          name="description"
          value={property.description ?? ""}
        />
        <input type="hidden" name="how_to" value={property.how_to ?? ""} />
        <input
          type="hidden"
          name="guidelines"
          value={property.guidelines ?? ""}
        />
        <input
          type="hidden"
          name="amenities"
          value={property.amenities.join("\n")}
        />
        {canManage ? (
          <>
            <input type="hidden" name="status" value={property.status} />
            <input
              type="hidden"
              name="max_guests"
              value={property.max_guests ?? ""}
            />
          </>
        ) : null}

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
            <Button type="submit" variant="outline" disabled={isPending}>
              {isPending ? "Saving…" : "Save Address"}
            </Button>
          </div>
        </div>
      </form>
    </ReviewSection>
  );
}
