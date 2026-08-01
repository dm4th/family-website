"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * The minimum a photo needs to be viewable full-screen. Callers pass their own
 * richer row type; the generic keeps that type intact for the render slots.
 */
export type LightboxPhoto = {
  id: string;
  signedUrl: string;
  /** Full-size object. Preferred here — the lightbox is the one place we want it. */
  fallbackUrl?: string | null;
  caption?: string | null;
};

/** Tabbable elements inside a container, in DOM order — for the focus trap. */
function focusablesIn(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

/**
 * Full-screen photo viewer: Escape closes, arrows navigate, Tab is trapped,
 * clicking the backdrop closes. Extracted from the Legacy archive gallery so
 * the property gallery doesn't grow a second one (PRD 35 follow-up).
 *
 * `renderCaption` and `renderActions` are the per-surface slots — the archive
 * puts dates and tagged people in the caption; a property puts "Make This the
 * Hero" in the actions.
 */
export function PhotoLightbox<T extends LightboxPhoto>({
  photos,
  index,
  onClose,
  onNavigate,
  fallbackAlt,
  renderCaption,
  renderActions,
}: {
  photos: T[];
  index: number;
  onClose: () => void;
  onNavigate: (i: number) => void;
  /** Alt text and dialog label for photos with no caption. */
  fallbackAlt: string;
  renderCaption?: (photo: T) => ReactNode;
  renderActions?: (photo: T) => ReactNode;
}) {
  const photo = photos[index]!;
  const containerRef = useRef<HTMLDivElement>(null);

  // Move focus into the lightbox on open and restore it to the trigger on
  // close. Runs once per open (the component stays mounted while navigating).
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const first = focusablesIn(containerRef.current)[0];
    first?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  // Keyboard: Escape closes, arrows navigate, Tab is trapped inside the dialog.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowRight" && index < photos.length - 1) {
        onNavigate(index + 1);
        return;
      }
      if (e.key === "ArrowLeft" && index > 0) {
        onNavigate(index - 1);
        return;
      }
      if (e.key === "Tab") {
        const items = focusablesIn(containerRef.current);
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !containerRef.current?.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !containerRef.current?.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, photos.length, onClose, onNavigate]);

  const caption = renderCaption?.(photo);
  const actions = renderActions?.(photo);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/90 p-4 sm:p-10"
      role="dialog"
      aria-modal="true"
      aria-label={photo.caption ?? fallbackAlt}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 inline-flex size-10 items-center justify-center rounded-full bg-background/10 text-surface transition-colors hover:bg-background/20"
      >
        <X aria-hidden />
      </button>

      <figure
        className="flex max-h-full max-w-4xl flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.fallbackUrl ?? photo.signedUrl}
          alt={photo.caption ?? fallbackAlt}
          className="max-h-[70vh] w-auto rounded-md object-contain shadow-portrait"
        />
        {caption && (
          <figcaption className="max-w-prose text-center text-sm text-surface/90">
            {caption}
          </figcaption>
        )}
        {actions && (
          <div className="flex flex-wrap items-center justify-center gap-3">
            {actions}
          </div>
        )}
      </figure>

      {index > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(index - 1);
          }}
          aria-label="Previous"
          className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-background/10 px-3 py-4 text-surface transition-colors hover:bg-background/20"
        >
          ‹
        </button>
      )}
      {index < photos.length - 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(index + 1);
          }}
          aria-label="Next"
          className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-background/10 px-3 py-4 text-surface transition-colors hover:bg-background/20"
        >
          ›
        </button>
      )}
    </div>
  );
}
