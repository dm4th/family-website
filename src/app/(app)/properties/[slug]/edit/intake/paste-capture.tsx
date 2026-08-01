"use client";

/**
 * "Paste Text" — the capture half of PRD 37.
 *
 * A big plain textarea, because the input is a document someone already has:
 * a Google Doc, an email, a page from a house manual typed up years ago.
 * Nothing clever is needed to receive it.
 *
 * The two buttons above the box are the part that matters. The mess this
 * feature exists to sort out is usually *already in the app* — the family's
 * real house manual lives in "How things work here" today, 4,400 characters of
 * bullets in one field — and asking a member to select it, copy it out of one
 * box, and paste it into another box on the same site would be a silly errand.
 * One press fills the textarea with what the page already holds.
 */

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormStatus } from "@/components/form-status";
import { MAX_PASTE_CHARS, MIN_PASTE_CHARS } from "@/lib/intake/schema";
import type { IntakeProperty } from "@/components/intake/property-carry-fields";

export function PasteCapture({
  property,
  busy,
  error,
  /**
   * Text the box starts with. Set when the Google Doc door (PRD 38) had to hand
   * the member back here: we already have their document, so the fallback is
   * this screen with the text in it, not this screen empty. The over-cap case
   * is the one that matters most, since the box's own "try it in two or three
   * parts" hint is only useful next to the thing that needs splitting.
   */
  initialText,
  onSubmit,
  onCancel,
}: {
  property: IntakeProperty;
  busy: boolean;
  error: string | null;
  initialText?: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initialText ?? "");
  const [pulledFrom, setPulledFrom] = useState<string | null>(null);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);

  const tooLong = text.length > MAX_PASTE_CHARS;
  const tooShort = text.trim().length > 0 && text.trim().length < MIN_PASTE_CHARS;
  const ready = text.trim().length >= MIN_PASTE_CHARS && !tooLong;

  /**
   * Append what a property field already holds. Append rather than replace, so
   * pressing both buttons gives the model the whole picture and pressing one
   * after pasting something doesn't throw the paste away.
   */
  function pullIn(label: string, value: string | null) {
    if (!value) return;
    setText((current) =>
      current.trim() ? `${current.trimEnd()}\n\n${value}` : value,
    );
    setPulledFrom(label);
    boxRef.current?.focus();
  }

  const sources: { label: string; value: string | null }[] = [
    { label: "How things work here", value: property.how_to },
    { label: "House rules", value: property.guidelines },
  ];
  const available = sources.filter((s) => s.value);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="font-display text-xl leading-tight text-foreground">
          Paste in what you&rsquo;ve got
        </h2>
        <p className="text-base text-foreground-muted">
          A document, an email, an old house manual, a list you typed up years
          ago. Paste the whole thing about {property.name} and we&rsquo;ll sort
          it out: who to call, the Wi-Fi, dates worth remembering, and the rest
          tidied up. Nothing is saved until you press Save.
        </p>
      </header>

      {available.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-md border border-dashed border-accent-bronze/40 bg-surface/60 p-5">
          <h3 className="font-display text-lg leading-tight text-foreground">
            Or start with what&rsquo;s already here
          </h3>
          <p className="text-base text-foreground-muted">
            If the notes you want sorted out are already on this property&rsquo;s
            page, bring them straight into the box. You&rsquo;ll get the chance to
            tidy the original afterwards.
          </p>
          <div className="flex flex-wrap gap-3">
            {available.map((s) => (
              <Button
                key={s.label}
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => pullIn(s.label, s.value)}
              >
                Use &ldquo;{s.label}&rdquo;
              </Button>
            ))}
          </div>
          <FormStatus tone="info">
            {pulledFrom
              ? `Added what's in "${pulledFrom}" to the box below. Nothing on the property has changed.`
              : null}
          </FormStatus>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <label
          htmlFor="paste-text"
          className="text-sm font-medium text-foreground"
        >
          The text to sort out
        </label>
        <Textarea
          ref={boxRef}
          id="paste-text"
          rows={16}
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste here. Bullets, headings, and messy formatting are all fine."
          className="text-base"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-foreground-subtle">
            Nothing is saved yet. You&rsquo;ll see everything before anything is
            added to {property.name}.
          </p>
          {tooLong ? (
            <p className="text-sm font-medium text-accent-bronze">
              That&rsquo;s longer than we can take in one go. Try it in two or
              three parts.
            </p>
          ) : tooShort ? (
            <p className="text-sm text-foreground-subtle">
              A little more, and we&rsquo;ll have something to work with.
            </p>
          ) : null}
        </div>
      </div>

      <p className="text-sm text-foreground-subtle">
        Account logins and passwords are the one thing we won&rsquo;t put on the
        page. If the document has any, we&rsquo;ll tell you what we found and
        leave them out. The Wi-Fi password is the exception, since that one is
        meant to be shared.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Back
        </Button>
        <div className="flex items-center gap-3">
          <FormStatus tone="error">{error}</FormStatus>
          <Button
            type="button"
            disabled={!ready || busy}
            onClick={() => onSubmit(text)}
          >
            {busy ? "Sorting it out…" : "Sort This Out"}
          </Button>
        </div>
      </div>
    </div>
  );
}
