"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  PHOTOS_BUCKET,
  MAX_PHOTO_BYTES,
  generateGooglePhotoPath,
  isAllowedMime,
  thumbPathFor,
} from "@/lib/photo-utils";
import { makeThumbnailFromBlob } from "@/lib/image-resize";
import { recordUploadedPhoto } from "@/app/(app)/photos/actions";
import { requestAccessToken } from "@/lib/google/identity";
import {
  PHOTOS_PICKER_SCOPE,
  createSession,
  deleteSession,
  downloadAtSize,
  listMediaItems,
  pollSession,
} from "@/lib/google/photos-picker";

type Attachment =
  | { kind: "profile"; profileId: string }
  | { kind: "property"; propertyId: string };

type Status =
  | { phase: "idle" }
  | { phase: "auth" }
  | {
      phase: "awaiting";
      pickerUri: string;
      elapsedMs: number;
      pickerOpened: boolean;
    }
  | { phase: "transferring"; current: number; total: number }
  | { phase: "error"; message: string }
  | { phase: "done"; succeeded: number; failed: number; lastError: string | null };

const MAX_DIMENSION = 2048;

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

function extensionForMime(mime: string): string {
  return MIME_TO_EXT[mime] ?? ".jpg";
}

/**
 * Transfer one picked mediaItem into Supabase Storage + photos row.
 * Returns null on success, or a human-readable error string on failure.
 * Never throws — caller treats null/string as the result.
 */
async function transferOne(opts: {
  supabase: ReturnType<typeof createClient>;
  token: string;
  item: import("@/lib/google/photos-picker").PickedMediaItem;
  attachment: Attachment;
}): Promise<string | null> {
  const { supabase, token, item, attachment } = opts;
  let blob: Blob;
  try {
    blob = await downloadAtSize({
      token,
      baseUrl: item.mediaFile.baseUrl,
      maxWidth: MAX_DIMENSION,
      maxHeight: MAX_DIMENSION,
    });
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }

  if (blob.size > MAX_PHOTO_BYTES) {
    return `A photo exceeded ${Math.round(MAX_PHOTO_BYTES / 1024 / 1024)}MB even after downsize. Skipped.`;
  }

  // Prefer the bytes' actual Content-Type over mediaFile.mimeType: Google's
  // resize endpoint transcodes HEIC → JPEG, so the original mime is wrong
  // for what we just downloaded.
  const mime = (
    blob.type ||
    item.mediaFile.mimeType?.toLowerCase() ||
    "image/jpeg"
  ).toLowerCase();
  if (!isAllowedMime(mime)) {
    return `Unsupported file type: ${mime}`;
  }

  // Derive extension from the actual mime, not the Google-side filename —
  // the latter may say .heic while the bytes are .jpg.
  const storagePath = generateGooglePhotoPath(`photo${extensionForMime(mime)}`);

  const { error: uploadError } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(storagePath, blob, { contentType: mime, upsert: false });
  if (uploadError) return uploadError.message;

  // Best-effort thumbnail companion so Google-imported photos get the small
  // rendition too (the bytes are already ≤2048px). Failure is non-fatal —
  // small contexts fall back to the full object.
  const thumb = await makeThumbnailFromBlob(blob);
  if (thumb) {
    // supabase-js surfaces errors in the result rather than throwing, but the
    // try/catch keeps the "must never fail the photo" guarantee airtight
    // against an unexpected reject.
    try {
      await supabase.storage
        .from(PHOTOS_BUCKET)
        .upload(thumbPathFor(storagePath), thumb, {
          contentType: "image/jpeg",
          upsert: false,
        });
    } catch {
      // Swallow — the photo's display object is already stored.
    }
  }

  const result = await recordUploadedPhoto({
    storagePath,
    attachment,
    source: "google_photos",
    googleMediaId: item.id,
  });
  if (!result.ok) {
    // Storage upload succeeded but DB row failed — clean up the orphan and its
    // thumbnail companion (harmless no-op when the thumb was never uploaded).
    await supabase.storage
      .from(PHOTOS_BUCKET)
      .remove([storagePath, thumbPathFor(storagePath)]);
    return result.message;
  }
  return null;
}

export function GooglePhotosPicker({ attachment }: { attachment: Attachment }) {
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const [, startTransition] = useTransition();
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);
  const pickerWindowRef = useRef<Window | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      pickerWindowRef.current?.close();
    };
  }, []);

  async function run() {
    abortRef.current?.abort();
    pickerWindowRef.current?.close();
    // Intentionally don't `pickerWindowRef.current = null` here — TS would
    // narrow .current to `null` for the rest of this async function, even
    // though the JSX "Open picker" handler reassigns it. The unmount
    // cleanup effect handles any leftover popup if the user navigates away.
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      setStatus({ phase: "auth" });
      // GIS opens its own consent popup, which consumes this click's
      // gesture. We *cannot* also window.open() the picker here — the
      // browser allows one popup per gesture. The picker open happens
      // below from a second user click ("Open picker").
      const { token } = await requestAccessToken({ scope: PHOTOS_PICKER_SCOPE });
      if (ac.signal.aborted) return;

      const session = await createSession(token);
      if (ac.signal.aborted) return;

      setStatus({
        phase: "awaiting",
        pickerUri: session.pickerUri,
        elapsedMs: 0,
        pickerOpened: false,
      });

      const completedSession = await pollSession({
        token,
        sessionId: session.id,
        pollIntervalHint: session.pollingConfig?.pollInterval,
        signal: ac.signal,
        onTick: (elapsedMs) =>
          // Preserve whether the user has already opened the picker tab.
          setStatus((prev) =>
            prev.phase === "awaiting" ? { ...prev, elapsedMs } : prev,
          ),
      });

      // Best-effort close of the picker tab.
      pickerWindowRef.current?.close();
      pickerWindowRef.current = null;

      if (!completedSession.mediaItemsSet) {
        setStatus({ phase: "error", message: "Picker closed before selection." });
        await deleteSession(token, session.id);
        return;
      }

      const items = await listMediaItems(token, session.id);
      if (items.length === 0) {
        setStatus({ phase: "error", message: "No photos were picked." });
        await deleteSession(token, session.id);
        return;
      }

      setStatus({ phase: "transferring", current: 0, total: items.length });
      const supabase = createClient();
      let succeeded = 0;
      let failed = 0;
      let lastError: string | null = null;

      for (let i = 0; i < items.length; i++) {
        if (ac.signal.aborted) return;
        const item = items[i]!;
        setStatus({ phase: "transferring", current: i + 1, total: items.length });

        const failure = await transferOne({
          supabase,
          token,
          item,
          attachment,
        });
        if (failure) {
          failed += 1;
          lastError = failure;
        } else {
          succeeded += 1;
        }
      }

      await deleteSession(token, session.id);

      if (succeeded === 0) {
        const msg = lastError ?? "All transfers failed.";
        setStatus({ phase: "error", message: msg });
        toast.error("Couldn't import from Google Photos", { description: msg });
        return;
      }
      setStatus({ phase: "done", succeeded, failed, lastError });
      // Toast survives even if the user has closed the modal. Sonner is
      // mounted in the (app) layout.
      const noun = `photo${succeeded === 1 ? "" : "s"}`;
      if (failed > 0) {
        toast.warning(`Added ${succeeded} ${noun}, ${failed} skipped`, {
          description: lastError ?? undefined,
        });
      } else {
        toast.success(`Added ${succeeded} ${noun} from Google Photos`);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      if (ac.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      setStatus({ phase: "error", message: msg });
      toast.error("Google Photos picker failed", { description: msg });
    }
  }

  function cancel() {
    abortRef.current?.abort();
    pickerWindowRef.current?.close();
    pickerWindowRef.current = null;
    setStatus({ phase: "idle" });
  }

  const isBusy =
    status.phase === "auth" ||
    status.phase === "awaiting" ||
    status.phase === "transferring";

  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-accent-bronze/40 bg-surface/60 px-5 py-8 text-center">
      <p className="eyebrow text-accent-bronze">Add from Google Photos</p>
      <p className="max-w-sm text-sm text-foreground-muted">
        Pick photos straight from your Google library. We&rsquo;ll save a
        web-sized copy ({MAX_DIMENSION}px) to keep the family&rsquo;s storage
        light.
      </p>

      {status.phase === "idle" && (
        <Button type="button" variant="outline" size="sm" onClick={run}>
          Continue with Google Photos
        </Button>
      )}

      {status.phase === "auth" && (
        <p className="text-xs text-foreground-muted">
          Opening Google sign-in…
        </p>
      )}

      {status.phase === "awaiting" && !status.pickerOpened && (
        <>
          <p className="text-xs text-foreground-muted">
            Signed in. Click below to open Google Photos and pick your photos.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => {
                const w = window.open(status.pickerUri, "_blank", "noopener");
                pickerWindowRef.current = w;
                setStatus((prev) =>
                  prev.phase === "awaiting"
                    ? { ...prev, pickerOpened: true }
                    : prev,
                );
              }}
            >
              Open Picker
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </>
      )}

      {status.phase === "awaiting" && status.pickerOpened && (
        <>
          <p className="text-xs text-foreground-muted">
            Pick photos in the Google tab, then come back. Still waiting
            {status.elapsedMs > 30_000
              ? "… you can also reopen the picker."
              : "…"}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const w = window.open(status.pickerUri, "_blank", "noopener");
                pickerWindowRef.current = w;
              }}
            >
              Reopen Picker
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </>
      )}

      {status.phase === "transferring" && (
        <p className="text-xs text-foreground-muted">
          Transferring {status.current}/{status.total}…
        </p>
      )}

      {status.phase === "done" && (
        <>
          <p className="text-xs text-foreground-muted">
            Added {status.succeeded} photo
            {status.succeeded === 1 ? "" : "s"} from Google Photos.
          </p>
          {status.failed > 0 && (
            <p className="text-xs text-destructive">
              {status.failed} couldn&rsquo;t be saved
              {status.lastError ? `. Last error: ${status.lastError}` : "."}
            </p>
          )}
          {status.failed > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={run}>
              Try the Failed Ones Again
            </Button>
          )}
        </>
      )}

      {status.phase === "error" && (
        <>
          <p className="text-xs text-destructive">{status.message}</p>
          <Button type="button" variant="outline" size="sm" onClick={run}>
            Try Again
          </Button>
        </>
      )}

      <p className="text-[0.6875rem] text-foreground-subtle">
        Per-pick consent: we never read your wider library.
      </p>

      {isBusy && status.phase !== "awaiting" && (
        <button
          type="button"
          onClick={cancel}
          className="text-[0.6875rem] text-foreground-subtle underline-offset-4 hover:underline"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
