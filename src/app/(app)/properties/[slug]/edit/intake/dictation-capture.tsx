"use client";

/**
 * "Just talk" — the capture half of dictation (PRD 34).
 *
 * The universal path is the plain textarea plus a line telling the member to use
 * the microphone on their own keyboard. That is not a fallback: every phone and
 * tablet in the family already has dictation built into the keyboard, it needs
 * no permission prompt from us, no audio leaves the device, and it works in
 * every browser today. Building on it meant no transcription vendor and no
 * recorded audio to store.
 *
 * The Web Speech button below is a convenience for browsers that have it, and is
 * simply absent where they don't. It appends into the same textarea and never
 * submits: what the member reads in the box is what gets sent, same as
 * everywhere else in intake.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormStatus } from "@/components/form-status";
import { MAX_DICTATION_CHARS } from "@/lib/intake/schema";

export function DictationCapture({
  propertyName,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  propertyName: string;
  busy: boolean;
  error: string | null;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const { supported, listening, micBlocked, toggle } = useSpeechRecognition(
    (phrase) => {
      setText((current) =>
        current ? `${current.trimEnd()} ${phrase}` : phrase,
      );
    },
  );

  const tooLong = text.length > MAX_DICTATION_CHARS;
  const ready = text.trim().length > 0 && !tooLong;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="font-display text-xl leading-tight text-foreground">
          Say what you want to add
        </h2>
        <p className="text-base text-foreground-muted">
          Tap the microphone on your keyboard and just talk about{" "}
          {propertyName}: house rules, how something works, someone worth
          calling, a date to remember. Don&rsquo;t worry about tidiness or
          getting it in order. We&rsquo;ll clean it up and then walk you through
          each thing you could save.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <label
          htmlFor="dictation-text"
          className="text-sm font-medium text-foreground"
        >
          What you want to say
        </label>
        <Textarea
          id="dictation-text"
          rows={12}
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tap the microphone on your keyboard, or type here if you'd rather."
          className="text-base"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-foreground-subtle">
            Nothing is saved yet. You&rsquo;ll see everything before anything is
            added to {propertyName}.
          </p>
          {tooLong ? (
            <p className="text-sm font-medium text-accent-bronze">
              That&rsquo;s longer than we can take in one go. Try saving it in a
              couple of shorter goes.
            </p>
          ) : null}
        </div>
      </div>

      {supported ? (
        <div className="flex flex-col gap-2">
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={toggle}
            >
              {listening ? "Stop Recording" : "Use the Microphone"}
            </Button>
          </div>
          {micBlocked ? (
            <p className="text-sm font-medium text-accent-bronze">
              Your browser is blocking the microphone for this site. Allow it in
              your browser&rsquo;s site settings, or use the microphone on your
              keyboard instead.
            </p>
          ) : (
            <p className="text-sm text-foreground-subtle">
              {listening
                ? "Listening. Your words appear in the box above as you speak."
                : "This browser can listen directly. The microphone on your keyboard works just as well."}
            </p>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Go Back
        </Button>
        <div className="flex items-center gap-3">
          <FormStatus tone="error">{error}</FormStatus>
          <Button
            type="button"
            disabled={busy || !ready}
            onClick={() => onSubmit(text)}
          >
            {busy ? "Tidying up…" : "Tidy and Review"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Web Speech, where it exists.
 *
 * Deliberately thin. It appends finalised phrases into the textarea and stops;
 * it does not submit, does not replace what's already there, and transient
 * errors stay silent — if it hiccups mid-sentence the member still has a
 * keyboard microphone and a box, which is the whole path for everyone whose
 * browser lacks this anyway.
 *
 * The one error that must NOT stay silent is `not-allowed`: the browser is
 * remembering an earlier "Block" on the mic permission, so the click starts,
 * dies in ~100ms with no prompt, and the button flips straight back — which
 * reads as a dead button, not a setting. That state persists until the member
 * changes it in the browser, so it gets a message with the way out.
 */
function useSpeechRecognition(onPhrase: (phrase: string) => void) {
  const [listening, setListening] = useState(false);
  const [micBlocked, setMicBlocked] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onPhraseRef = useRef(onPhrase);

  /**
   * Whether this browser has the API, read through `useSyncExternalStore` rather
   * than detected in an effect. The server snapshot is `false`, so the button is
   * absent in the markup and appears on hydration where it's real — the one
   * shape that neither mismatches nor flashes a control that can't work.
   */
  const supported = useSyncExternalStore(
    subscribeNever,
    () => Boolean(speechRecognitionConstructor()),
    () => false,
  );

  // Kept current in an effect, not during render: writing a ref while rendering
  // is a side effect React is allowed to discard or repeat.
  useEffect(() => {
    onPhraseRef.current = onPhrase;
  }, [onPhrase]);

  // Nothing is constructed until the member asks to listen, so a browser that
  // has the API but is never used doesn't hold a recogniser open.
  useEffect(() => {
    return () => {
      const recognition = recognitionRef.current;
      if (!recognition) return;
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.stop();
    };
  }, []);

  function ensureRecognition(): SpeechRecognitionLike | null {
    if (recognitionRef.current) return recognitionRef.current;
    const Ctor = speechRecognitionConstructor();
    if (!Ctor) return null;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const phrase = result[0]?.transcript?.trim();
          if (phrase) onPhraseRef.current(phrase);
        }
      }
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setMicBlocked(true);
      }
      setListening(false);
    };

    recognitionRef.current = recognition;
    return recognition;
  }

  function toggle() {
    const recognition = ensureRecognition();
    if (!recognition) return;
    if (listening) {
      recognition.stop();
      setListening(false);
      return;
    }
    try {
      // A member who just fixed the site setting deserves a clean retry rather
      // than a message that never clears.
      setMicBlocked(false);
      recognition.start();
      setListening(true);
    } catch {
      // Already running. The permission case arrives through `onerror` above,
      // not here, and transient failures leave the textarea path untouched.
      setListening(false);
    }
  }

  return { supported, listening, micBlocked, toggle };
}

/** The capability never changes for the life of the page, so nothing to watch. */
function subscribeNever(): () => void {
  return () => {};
}

function speechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Minimal shape of the Web Speech API, declared locally because it isn't in
 * TypeScript's DOM library and pulling in a types package for a progressive
 * enhancement isn't worth a dependency.
 */
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<
          ArrayLike<{ transcript: string }> & { isFinal: boolean }
        >;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
