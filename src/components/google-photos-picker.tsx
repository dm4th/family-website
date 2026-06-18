"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  PHOTOS_BUCKET,
  MAX_PHOTO_BYTES,
  generateGooglePhotoPath,
  isAllowedMime,
} from "@/lib/photo-utils";
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
  | { phase: "awaiting"; pickerUri: string; elapsedMs: number }
  | { phase: "transferring"; current: number; total: number }
  | { phase: "error"; message: string }
  | { phase: "done"; succeeded: number; failed: number; lastError: string | null };

const MAX_DIMENSION = 2048;

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
    return `A photo exceeded ${Math.round(MAX_PHOTO_BYTES / 1024 / 1024)}MB even after downsize — skipped.`;
  }

  const mime =
    item.mediaFile.mimeType?.toLowerCase() || blob.type || "image/jpeg";
  if (!isAllowedMime(mime)) {
    return `Unsupported file type: ${mime}`;
  }

  const filename = item.mediaFile.filename ?? "photo.jpg";
  const storagePath = generateGooglePhotoPath(filename);

  const { error: uploadError } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(storagePath, blob, { contentType: mime, upsert: false });
  if (uploadError) return uploadError.message;

  const result = await recordUploadedPhoto({
    storagePath,
    attachment,
    source: "google_photos",
    googleMediaId: item.id,
  });
  if (!result.ok) {
    // Storage upload succeeded but DB row failed — clean up the orphan.
    await supabase.storage.from(PHOTOS_BUCKET).remove([storagePath]);
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
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      setStatus({ phase: "auth" });
      const { token } = await requestAccessToken({ scope: PHOTOS_PICKER_SCOPE });
      if (ac.signal.aborted) return;

      const session = await createSession(token);
      if (ac.signal.aborted) return;

      // Open Google's hosted picker. Pop-up blockers will fire if this is
      // called outside a user gesture — `run()` is triggered by a button
      // click so we're fine.
      const opened = window.open(session.pickerUri, "_blank", "noopener");
      pickerWindowRef.current = opened;
      setStatus({
        phase: "awaiting",
        pickerUri: session.pickerUri,
        elapsedMs: 0,
      });

      const completedSession = await pollSession({
        token,
        sessionId: session.id,
        pollIntervalHint: session.pollingConfig?.pollInterval,
        signal: ac.signal,
        onTick: (elapsedMs) =>
          setStatus({
            phase: "awaiting",
            pickerUri: session.pickerUri,
            elapsedMs,
          }),
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
        setStatus({
          phase: "error",
          message: lastError ?? "All transfers failed.",
        });
        return;
      }
      setStatus({ phase: "done", succeeded, failed, lastError });
      startTransition(() => router.refresh());
    } catch (err) {
      if (ac.signal.aborted) return;
      setStatus({
        phase: "error",
        message: err instanceof Error ? err.message : String(err),
      });
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

      {status.phase === "awaiting" && (
        <>
          <p className="text-xs text-foreground-muted">
            Pick photos in the Google tab, then come back. Still waiting
            {status.elapsedMs > 30_000 ? "… you can also reopen the picker." : "…"}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.open(status.pickerUri, "_blank", "noopener")}
            >
              Reopen picker
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
              {status.lastError ? ` — last error: ${status.lastError}` : "."}
            </p>
          )}
          {status.failed > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={run}>
              Try the failed ones again
            </Button>
          )}
        </>
      )}

      {status.phase === "error" && (
        <>
          <p className="text-xs text-destructive">{status.message}</p>
          <Button type="button" variant="outline" size="sm" onClick={run}>
            Try again
          </Button>
        </>
      )}

      <p className="text-[0.6875rem] text-foreground-subtle">
        Per-pick consent — we never read your wider library.
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
