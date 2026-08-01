"use client";

import { useState } from "react";

import { Label } from "@/components/ui/label";
import { Eyebrow } from "@/components/shell";
import type { FieldConfidence } from "@/lib/intake/schema";

/**
 * The "here's what we read, edit and confirm" surface (PRD 32).
 *
 * Deliberately a shell and not a form: the form inside it is whichever existing
 * editor the target needs, posting to its own unchanged Server Action. This
 * component owns the framing — what the document said, which fields to look at
 * twice, and the standing promise that closing the page saves nothing.
 *
 * Slices 2 and 3 drop their own review forms in here; the framing shouldn't
 * need to change.
 */
export function ReviewShell({
  title,
  description,
  rawText,
  sourceUrl,
  sourceLinkLabel,
  children,
}: {
  title: string;
  description: string;
  rawText?: string;
  /** Short-lived signed link to the uploaded document, when we have one. */
  sourceUrl?: string | null;
  /**
   * What the link should call the source. "Open the photo you uploaded" was
   * wrong for a pasted document and a spoken note (Dan, 2026-08-01), so each
   * intent names its own.
   */
  sourceLinkLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="font-display text-xl leading-tight text-foreground">
          {title}
        </h2>
        <p className="text-base text-foreground-muted">{description}</p>
        <p className="text-sm text-foreground-subtle">
          Check every field before you save. Nothing is saved until you press
          Save, and leaving this page saves nothing.
        </p>
        {sourceUrl ? (
          <p className="text-sm">
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              {sourceLinkLabel ?? "Open the photo you uploaded"}
            </a>{" "}
            <span className="text-foreground-subtle">
              (opens in a new tab, so you can check it against what we read)
            </span>
          </p>
        ) : null}
      </header>

      {children}

      {rawText ? <RawTextDisclosure rawText={rawText} /> : null}
    </div>
  );
}

/**
 * The model's plain-text read of the document, collapsed by default. It's the
 * answer to "where did that come from?" without putting a wall of OCR above
 * the fields the member came here to check.
 */
function RawTextDisclosure({ rawText }: { rawText: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-border pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="min-h-10 text-sm text-foreground-muted underline-offset-4 hover:text-foreground hover:underline"
      >
        {open ? "Hide what we read" : "Show what we read"}
      </button>
      {open ? (
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-surface/60 p-4 text-sm text-foreground-muted">
          {rawText}
        </pre>
      ) : null}
    </div>
  );
}

/**
 * One reviewable field. `confidence` flags a shaky read so the member's eye
 * lands there first; the value is always fully editable and is never hidden or
 * withheld on the strength of a low score.
 */
export function ReviewField({
  label,
  htmlFor,
  confidence,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  confidence?: FieldConfidence;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const uncertain = confidence === "medium" || confidence === "low";
  const flagId = uncertain ? `${htmlFor}-confidence` : undefined;

  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor} className="text-foreground-muted">
          {label}
        </Label>
        {uncertain ? (
          <span
            id={flagId}
            className="text-sm font-medium text-accent-bronze"
          >
            {confidence === "low" ? "Hard to read, please check" : "Please check"}
          </span>
        ) : null}
      </div>
      {children}
      {hint ? (
        <p className="text-sm text-foreground-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Small heading for a group of fields inside the shell (e.g. "Contact",
 * "Property address") so a multi-target review reads as sections rather than
 * one long column.
 */
export function ReviewSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-md border border-dashed border-accent-bronze/40 bg-surface/60 p-4">
      <Eyebrow>{label}</Eyebrow>
      {children}
    </section>
  );
}
