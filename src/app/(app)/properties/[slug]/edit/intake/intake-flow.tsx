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
import { ReviewShell, ReviewSection } from "@/components/intake/review-shell";
import { SaveProgress } from "@/components/intake/save-progress";
import type { IntakeProperty } from "@/components/intake/property-carry-fields";
import { createClient } from "@/lib/supabase/client";
import { prepareImageForUpload } from "@/lib/image-resize";
import {
  INTAKE_BUCKET,
  INTAKE_MAX_DIMENSION,
  MAX_INTAKE_BYTES,
  generateIntakePath,
  isAllowedIntakeMime,
  type CalendarExtraction,
  type ContactExtraction,
  type DictationExtraction,
  type DocumentIntent,
  type NoteExtraction,
} from "@/lib/intake/schema";
import {
  extractDictation,
  extractIntake,
  refreshIntakeProperty,
} from "./actions";
import { CalendarReview } from "./calendar-review";
import { ContactReview } from "./contact-review";
import { DictationCapture } from "./dictation-capture";
import { NoteReview } from "./note-review";

export type { IntakeProperty };

const MAX_MB = Math.round(MAX_INTAKE_BYTES / 1024 / 1024);

/**
 * The two things a member can photograph, in their words rather than ours. The
 * choice is explicit because it changes what we ask the model to look for: a
 * bill has a vendor and an account number, a note has instructions and people.
 */
const KINDS: {
  intent: DocumentIntent;
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
    intent: "calendar",
    title: "A due date to remember",
    blurb:
      "A bill or notice with a payment date on it. We'll pull out the date and what it's for, and offer to put it on the calendar.",
    button: "Choose a Document",
    reviewTitle: "Here's the date we found",
    reviewDescription:
      "Nothing goes on the calendar until you press Save. Check the date against the document first.",
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

/**
 * The voice door's framing at review time. Not a `KINDS` entry, because that
 * list is specifically "what are you photographing" — every card there owns a
 * file input, and dictation has no file to choose.
 */
const DICTATION_REVIEW = {
  reviewTitle: "Here's what we heard",
  reviewDescription:
    "We've tidied up what you said. Read it over, then take the parts worth keeping. Nothing is saved until you press Save.",
};

/**
 * How many separate things this review is offering to save. Counts what the
 * member can actually act on, so a note with nothing for "how things work"
 * doesn't inflate the denominator with a section that was never rendered.
 */
function countOffered(extraction: NoteExtraction | DictationExtraction): number {
  return (
    (extraction.suggestedGuidelines.value ? 1 : 0) +
    (extraction.suggestedHowTo.value ? 1 : 0) +
    extraction.suggestedContacts.length +
    ("suggestedReminders" in extraction
      ? extraction.suggestedReminders.length
      : 0)
  );
}

type Phase =
  | { name: "idle" }
  /** The dictation capture screen (PRD 34). No upload; the input is speech. */
  | { name: "dictate" }
  | { name: "working"; message: string }
  | { name: "error"; message: string }
  | {
      name: "review";
      intent: "dictation";
      extraction: DictationExtraction;
      sourceUrl: string | null;
      storagePath: null;
    }
  | {
      name: "review";
      intent: "contact";
      extraction: ContactExtraction;
      sourceUrl: string | null;
      storagePath: string;
    }
  | {
      name: "review";
      intent: "note";
      extraction: NoteExtraction;
      sourceUrl: string | null;
      storagePath: string;
    }
  | {
      name: "review";
      intent: "calendar";
      extraction: CalendarExtraction;
      sourceUrl: string | null;
      storagePath: string;
    };

/** State of the "also look for a due date" offer on a contact/note result. */
type CrossPhase =
  | { name: "idle" }
  | { name: "working" }
  | { name: "error"; message: string }
  | { name: "ready"; extraction: CalendarExtraction };

export function IntakeFlow({
  property: initialProperty,
  canManage,
  initialMode,
}: {
  property: IntakeProperty;
  canManage: boolean;
  /** "voice" when the member arrived via the edit page's Add by Voice door. */
  initialMode?: "voice";
}) {
  // Held in state, not read straight from the prop, because a review session can
  // save more than once and the forms below carry the property's other fields
  // through each submit. See `refreshIntakeProperty` for why that matters.
  const [property, setProperty] = useState(initialProperty);
  /** True while the property is being re-read after a save. */
  const [refreshing, setRefreshing] = useState(false);
  const [phase, setPhase] = useState<Phase>(
    initialMode === "voice" ? { name: "dictate" } : { name: "idle" },
  );
  /**
   * The capture screen's own busy flag and error, deliberately not folded into
   * `phase`. Moving to a "working" phase would unmount the textarea, and a
   * failed tidy-up would take the member's dictation down with it — the one
   * thing they cannot get back by pressing a button again.
   */
  const [tidying, setTidying] = useState(false);
  const [dictationError, setDictationError] = useState<string | null>(null);
  /**
   * How many of this review's destinations have been saved (PRD 34). Counted
   * here rather than inside each review form because a session's updates are
   * spread across two components — the note routing and, for dictation, the
   * reminders underneath it — and "2 of 4" is only true if it counts both.
   */
  const [savedCount, setSavedCount] = useState(0);
  /**
   * The "one upload, two records" offer (PRD 32, slice 3): after a document has
   * been read for its contact details or as a note, the member can ask us to
   * look at the *same* upload again for a due date. It re-reads rather than
   * extracting everything up front, so a member who only wanted a phone number
   * never pays for a second read.
   */
  const [cross, setCross] = useState<CrossPhase>({ name: "idle" });
  /** Which card is working, for the status line. Not used to route the upload. */
  const [pending, setPending] = useState<DocumentIntent | null>(null);

  async function handleFile(file: File, forIntent: DocumentIntent) {
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
      setCross({ name: "idle" });
      setSavedCount(0);
      if (result.intent === "note") {
        setPhase({
          name: "review",
          intent: "note",
          extraction: result.extraction,
          sourceUrl: result.sourceUrl,
          storagePath,
        });
      } else if (result.intent === "calendar") {
        setPhase({
          name: "review",
          intent: "calendar",
          extraction: result.extraction,
          sourceUrl: result.sourceUrl,
          storagePath,
        });
      } else {
        setPhase({
          name: "review",
          intent: "contact",
          extraction: result.extraction,
          sourceUrl: result.sourceUrl,
          storagePath,
        });
      }
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

  /** Send the dictated text off to be tidied, then hand it to the note review. */
  async function handleDictation(text: string) {
    setTidying(true);
    setDictationError(null);
    try {
      const result = await extractDictation(property.id, text);
      if (result.status === "error") {
        setDictationError(result.message);
        return;
      }
      setCross({ name: "idle" });
      setSavedCount(0);
      setPhase({
        name: "review",
        intent: "dictation",
        extraction: result.extraction,
        sourceUrl: result.sourceUrl,
        storagePath: null,
      });
    } catch (error) {
      setDictationError(
        error instanceof Error
          ? `Something went wrong: ${error.message}`
          : "Something went wrong. Please try again.",
      );
    } finally {
      setTidying(false);
    }
  }

  /**
   * Called by any review form that just wrote to the property. Pulls the row
   * back so the *other* forms carry what's actually stored rather than what was
   * there when the page loaded.
   */
  async function handlePropertySaved() {
    // Sibling forms are held while this is in flight. Without it, a member who
    // presses the second Save inside the refresh round-trip submits the same
    // stale carry values the refresh exists to replace — a narrower version of
    // exactly the bug being fixed.
    setRefreshing(true);
    try {
      const fresh = await refreshIntakeProperty(property.id);
      if (fresh) setProperty(fresh);
    } finally {
      setRefreshing(false);
    }
  }

  /** Re-read the document already in storage, this time for a due date. */
  async function handleAlsoCheckDates(storagePath: string) {
    setCross({ name: "working" });
    const result = await extractIntake(property.id, storagePath, "calendar");
    if (result.status === "error") {
      setCross({ name: "error", message: result.message });
      return;
    }
    if (result.intent !== "calendar") {
      setCross({ name: "error", message: "We couldn't read that for dates." });
      return;
    }
    setCross({ name: "ready", extraction: result.extraction });
  }

  if (phase.name === "dictate") {
    return (
      <DictationCapture
        propertyName={property.name}
        busy={tidying}
        error={dictationError}
        onSubmit={(text) => void handleDictation(text)}
        onCancel={() => {
          setDictationError(null);
          setPhase({ name: "idle" });
        }}
      />
    );
  }

  if (phase.name === "review") {
    const reviewKind =
      phase.intent === "dictation"
        ? DICTATION_REVIEW
        : (KINDS.find((k) => k.intent === phase.intent) ?? KINDS[0]);
    return (
      <ReviewShell
        title={reviewKind.reviewTitle}
        description={reviewKind.reviewDescription}
        rawText={
          phase.intent === "contact" || phase.intent === "calendar"
            ? phase.extraction.rawText
            : undefined
        }
        sourceUrl={phase.sourceUrl}
      >
        {phase.intent === "dictation" ? (
          <>
            <SaveProgress
              saved={savedCount}
              total={countOffered(phase.extraction)}
            />
            <NoteReview
              property={property}
              extraction={phase.extraction}
              canManage={canManage}
              source="voice"
              onStartOver={() => setPhase({ name: "dictate" })}
              onPropertySaved={handlePropertySaved}
              onItemSaved={() => setSavedCount((n) => n + 1)}
              propertyBusy={refreshing}
            />
            {/*
              Reminders come from the same extraction rather than the "also check
              this document" second read the photo intents offer. There is no
              document to re-read: "remind me the propane is due on the
              fifteenth" is one sentence inside the same paragraph as everything
              else, so asking twice would mean paying twice to read it.
            */}
            {phase.extraction.suggestedReminders.length > 0 && (
              <CalendarReview
                property={property}
                extraction={{
                  reminders: phase.extraction.suggestedReminders,
                  rawText: "",
                }}
                source="voice"
                onStartOver={() => setPhase({ name: "dictate" })}
                onItemSaved={() => setSavedCount((n) => n + 1)}
              />
            )}
          </>
        ) : phase.intent === "calendar" ? (
          <CalendarReview
            property={property}
            extraction={phase.extraction}
            onStartOver={() => setPhase({ name: "idle" })}
          />
        ) : phase.intent === "note" ? (
          <>
            <SaveProgress
              saved={savedCount}
              total={countOffered(phase.extraction)}
            />
            <NoteReview
              property={property}
              extraction={phase.extraction}
              canManage={canManage}
              onStartOver={() => setPhase({ name: "idle" })}
              onPropertySaved={handlePropertySaved}
              onItemSaved={() => setSavedCount((n) => n + 1)}
              propertyBusy={refreshing}
            />
            <AlsoCheckDates
              property={property}
              cross={cross}
              onCheck={() => void handleAlsoCheckDates(phase.storagePath)}
              onDismiss={() => setCross({ name: "idle" })}
            />
          </>
        ) : (
          <>
            <ContactReview
              property={property}
              extraction={phase.extraction}
              canManage={canManage}
              onStartOver={() => setPhase({ name: "idle" })}
              onPropertySaved={handlePropertySaved}
              propertyBusy={refreshing}
            />
            <AlsoCheckDates
              property={property}
              cross={cross}
              onCheck={() => void handleAlsoCheckDates(phase.storagePath)}
              onDismiss={() => setCross({ name: "idle" })}
            />
          </>
        )}
      </ReviewShell>
    );
  }

  const busy = phase.name === "working";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="font-display text-xl leading-tight text-foreground">
          What have you got?
        </h2>
        <p className="text-base text-foreground-muted">
          Photograph it, or just say it out loud. We&rsquo;ll show you what we
          found so you only have to check it rather than type it. Nothing is
          saved until you press Save.
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

        {/*
          The voice door also lives here, not only on the edit page, so a member
          who landed on the chooser directly (a bookmark, the Contacts link)
          isn't shown three photo options and no way to talk.
        */}
        <div className="flex flex-col gap-3 rounded-md border border-dashed border-accent-bronze/40 bg-surface/60 p-5">
          <h3 className="font-display text-lg leading-tight text-foreground">
            Just talk
          </h3>
          <p className="flex-1 text-base text-foreground-muted">
            Nothing on paper? Say what you want to add and we&rsquo;ll tidy it
            up, then walk you through where each part could go.
          </p>
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setDictationError(null);
                setPhase({ name: "dictate" });
              }}
            >
              Start Talking
            </Button>
          </div>
        </div>
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
 * "One upload, two records" (PRD 32, slice 3).
 *
 * Offered after a document has already been read some other way, because the
 * file is still in storage and reading it again for a date costs a fraction of a
 * cent. Deliberately a button rather than something we do automatically: a
 * member who photographed a bill to get the plumber's number shouldn't be
 * charged for a second read, or handed a calendar form they didn't ask for.
 */
function AlsoCheckDates({
  property,
  cross,
  onCheck,
  onDismiss,
}: {
  property: IntakeProperty;
  cross: CrossPhase;
  onCheck: () => void;
  /** Puts the offer back to its button. Never discards the review above it. */
  onDismiss: () => void;
}) {
  if (cross.name === "ready") {
    return (
      <CalendarReview
        property={property}
        extraction={cross.extraction}
        // Collapses this section back to the offer. It must NOT reset the whole
        // flow the way the top-level review's "start over" does — the contact or
        // note form sitting above this one may be unsaved.
        onStartOver={onDismiss}
      />
    );
  }

  return (
    <ReviewSection label="Also on this document">
      <p className="text-base text-foreground-muted">
        Does this document have a payment date on it? We can look, and offer to
        put it on {property.name}&rsquo;s calendar.
      </p>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={cross.name === "working"}
          onClick={onCheck}
        >
          {cross.name === "working" ? "Looking…" : "Check for a Due Date"}
        </Button>
        <FormStatus tone="error">
          {cross.name === "error" ? cross.message : null}
        </FormStatus>
      </div>
    </ReviewSection>
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
