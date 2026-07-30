"use client";

/**
 * The Smart Intake pipeline (PRD 32): pick what you're photographing, upload it,
 * we read it, you review and save.
 *
 * The pipeline is intent-driven and shared. Each intent contributes a prompt and
 * schema (`src/lib/intake/schema.ts`) and a review form; upload, downscaling,
 * storage, extraction, and the review framing are common to all of them.
 */

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/form-status";
import { ReviewShell } from "@/components/intake/review-shell";
import type { IntakeProperty } from "@/components/intake/property-carry-fields";
import { createClient } from "@/lib/supabase/client";
import { prepareImageForUpload } from "@/lib/image-resize";
import {
  INTAKE_BUCKET,
  INTAKE_MAX_DIMENSION,
  MAX_INTAKE_BYTES,
  generateIntakePath,
  isAllowedIntakeMime,
  type ContactExtraction,
  type IntakeIntent,
  type NoteExtraction,
} from "@/lib/intake/schema";
import { extractIntake } from "./actions";
import { ContactReview } from "./contact-review";
import { NoteReview } from "./note-review";

export type { IntakeProperty };

const MAX_MB = Math.round(MAX_INTAKE_BYTES / 1024 / 1024);

/**
 * The two things a member can photograph, in their words rather than ours. The
 * choice is explicit because it changes what we ask the model to look for: a
 * bill has a vendor and an account number, a note has instructions and people.
 */
const KINDS: {
  intent: IntakeIntent;
  title: string;
  blurb: string;
  button: string;
  reviewTitle: string;
  reviewDescription: string;
}[] = [
  {
    intent: "contact",
    title: "A bill or statement",
    blurb:
      "A utility bill, an insurance statement, or a tax notice. We'll pull out the company, the phone number, and the account number.",
    button: "Choose a Bill",
    reviewTitle: "Here's what we read",
    reviewDescription:
      "These are our best read of your document. Correct anything that looks wrong, then save.",
  },
  {
    intent: "note",
    title: "A handwritten note",
    blurb:
      "Notes about how the place works, who to call, or what guests should know. We'll type it up for you to check.",
    button: "Choose a Note",
    reviewTitle: "Here's what we read",
    reviewDescription:
      "Handwriting is the hardest thing for us to read, so please go through this against the photo before you save anything.",
  },
];

type Phase =
  | { name: "idle" }
  | { name: "working"; message: string }
  | { name: "error"; message: string }
  | {
      name: "review";
      intent: "contact";
      extraction: ContactExtraction;
      sourceUrl: string | null;
    }
  | {
      name: "review";
      intent: "note";
      extraction: NoteExtraction;
      sourceUrl: string | null;
    };

export function IntakeFlow({
  property,
  canManage,
}: {
  property: IntakeProperty;
  canManage: boolean;
}) {
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  /** Which card is working, for the status line. Not used to route the upload. */
  const [pending, setPending] = useState<IntakeIntent | null>(null);

  async function handleFile(file: File, forIntent: IntakeIntent) {
    setPending(forIntent);
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

    setPhase({ name: "working", message: "Uploading your photo…" });

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
      const storagePath = generateIntakePath(isPdf ? "doc.pdf" : "doc.jpg");

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

      setPhase({
        name: "working",
        message:
          forIntent === "note"
            ? "Reading the handwriting…"
            : "Reading your document…",
      });

      const result = await extractIntake(property.id, storagePath, forIntent);
      if (result.status === "error") {
        setPhase({ name: "error", message: result.message });
        return;
      }
      setPhase(
        result.intent === "note"
          ? {
              name: "review",
              intent: "note",
              extraction: result.extraction,
              sourceUrl: result.sourceUrl,
            }
          : {
              name: "review",
              intent: "contact",
              extraction: result.extraction,
              sourceUrl: result.sourceUrl,
            },
      );
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
    const reviewKind =
      KINDS.find((k) => k.intent === phase.intent) ?? KINDS[0];
    return (
      <ReviewShell
        title={reviewKind.reviewTitle}
        description={reviewKind.reviewDescription}
        rawText={
          phase.intent === "contact" ? phase.extraction.rawText : undefined
        }
        sourceUrl={phase.sourceUrl}
      >
        {phase.intent === "note" ? (
          <NoteReview
            property={property}
            extraction={phase.extraction}
            canManage={canManage}
            onStartOver={() => setPhase({ name: "idle" })}
          />
        ) : (
          <ContactReview
            property={property}
            extraction={phase.extraction}
            canManage={canManage}
            onStartOver={() => setPhase({ name: "idle" })}
          />
        )}
      </ReviewShell>
    );
  }

  const busy = phase.name === "working";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="font-display text-xl leading-tight text-foreground">
          What are you photographing?
        </h2>
        <p className="text-base text-foreground-muted">
          We&rsquo;ll read it and show you what we found, so you only have to
          check it rather than type it. Nothing is saved until you press Save.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {KINDS.map((k) => (
          <KindCard
            key={k.intent}
            kind={k}
            busy={busy}
            working={busy && pending === k.intent}
            onFile={(file) => void handleFile(file, k.intent)}
          />
        ))}
      </div>

      <p className="text-sm text-foreground-subtle">
        JPG, PNG, or PDF · up to {MAX_MB}MB
      </p>

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

/**
 * One choice, with its own file input.
 *
 * Each card owning an input is what keeps the intent unambiguous: the handler
 * that fires is the one belonging to the card the member pressed, so the choice
 * travels with the file rather than through a piece of state set a moment
 * earlier and read a moment later.
 */
function KindCard({
  kind,
  busy,
  working,
  onFile,
}: {
  kind: (typeof KINDS)[number];
  busy: boolean;
  working: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed border-accent-bronze/40 bg-surface/60 p-5">
      <h3 className="font-display text-lg leading-tight text-foreground">
        {kind.title}
      </h3>
      <p className="flex-1 text-base text-foreground-muted">{kind.blurb}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        className="sr-only"
        aria-label={kind.button}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <div>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {working ? "Working…" : kind.button}
        </Button>
      </div>
    </div>
  );
}
