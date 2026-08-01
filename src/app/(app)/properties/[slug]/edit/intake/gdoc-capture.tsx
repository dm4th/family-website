"use client";

/**
 * "Connect Google Doc" — the capture half of PRD 38.
 *
 * This is a thin door onto PRD 37's engine, not a new pipeline. A Google Doc's
 * plain-text export *is* a paste: once the text is in hand it goes to the same
 * `extractPaste` action, with the same cap, the same fencing, the same
 * credential catch, the same review, and the same retention row. Everything
 * this file adds is the part before the text exists.
 *
 * Why there is a button here rather than the picker opening by itself: the
 * consent screen is a popup, and browsers only allow popups opened from a user
 * gesture. Arriving from the edit page's door is a link click, and that gesture
 * does not survive the navigation, so an automatic launch would be blocked in
 * exactly the case the door exists for. The press has to happen on this page.
 */

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/form-status";
import { requestAccessToken } from "@/lib/google/identity";
import { connectGoogleDoc } from "@/lib/google/docs-picker";

type Step =
  /** Waiting for the press that opens Google's consent screen. */
  | { name: "idle" }
  /** Consent and the picker are open; the member is choosing. */
  | { name: "picking" }
  /** They chose. Fetching the text out of Google. */
  | { name: "reading" };

export function GDocCapture({
  propertyName,
  /** True while the extraction that follows this screen is in flight. */
  busy,
  onDocument,
  /**
   * Something went wrong on the Google side. The parent drops the member onto
   * the paste screen with this message and whatever text we did manage to get,
   * so a failure lands on the sibling door rather than a dead end.
   */
  onFailure,
  onCancel,
}: {
  propertyName: string;
  busy: boolean;
  onDocument: (text: string, name: string) => void;
  onFailure: (message: string, recoveredText?: string) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>({ name: "idle" });

  async function handleConnect() {
    setStep({ name: "picking" });
    try {
      const picked = await connectGoogleDoc(requestAccessToken);
      if (!picked) {
        // Dismissed. Not an error, and not worth a message: they closed the
        // picker, so put them back where the button is.
        setStep({ name: "idle" });
        return;
      }
      setStep({ name: "reading" });
      if (!picked.text.trim()) {
        onFailure(
          `"${picked.name}" looks empty to us. You can paste the text in by hand instead.`,
        );
        return;
      }
      onDocument(picked.text, picked.name);
    } catch (error) {
      setStep({ name: "idle" });
      onFailure(
        error instanceof Error
          ? `We couldn't read that from Google: ${error.message} You can paste the text in by hand instead.`
          : "We couldn't read that from Google. You can paste the text in by hand instead.",
      );
    }
  }

  const working = step.name !== "idle" || busy;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="font-display text-xl leading-tight text-foreground">
          Read it straight from Google Docs
        </h2>
        <p className="text-base text-foreground-muted">
          If the notes about {propertyName} live in a Google Doc, you don&rsquo;t
          have to copy them out. Choose the document and we&rsquo;ll read it and
          sort it out: who to call, the Wi-Fi, dates worth remembering, and the
          rest tidied up. Nothing is saved until you press Save.
        </p>
      </header>

      <div className="flex flex-col gap-3 rounded-md border border-dashed border-accent-bronze/40 bg-surface/60 p-5">
        <h3 className="font-display text-lg leading-tight text-foreground">
          What Google will ask you
        </h3>
        <p className="text-base text-foreground-muted">
          Google will ask you to sign in and pick one document. We only ever see
          the document you pick. We can&rsquo;t see the rest of your Drive, and
          nothing stays connected afterwards, so you&rsquo;ll be asked again next
          time.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" disabled={working} onClick={onCancel}>
          Back
        </Button>
        <div className="flex items-center gap-3">
          <FormStatus tone="info">
            {step.name === "picking"
              ? "Waiting for you to choose a document in Google…"
              : step.name === "reading" || busy
                ? "Reading your document…"
                : null}
          </FormStatus>
          <Button type="button" disabled={working} onClick={() => void handleConnect()}>
            {working ? "Working…" : "Choose a Document"}
          </Button>
        </div>
      </div>
    </div>
  );
}
