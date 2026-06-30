"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  PHOTOS_BUCKET,
  MAX_PHOTO_BYTES,
  generatePhotoPath,
  isAllowedMime,
  thumbPathFor,
} from "@/lib/photo-utils";
import { prepareImageForUpload } from "@/lib/image-resize";
import { recordUploadedPhoto } from "@/app/(app)/photos/actions";

type Attachment =
  | { kind: "profile"; profileId: string }
  | { kind: "property"; propertyId: string };

type Status =
  | { phase: "idle" }
  | { phase: "uploading"; current: number; total: number }
  | { phase: "error"; message: string }
  | { phase: "done"; count: number };

const MAX_MB = Math.round(MAX_PHOTO_BYTES / 1024 / 1024);

export function PhotoUpload({
  attachment,
  label = "Add Photo",
  className,
}: {
  attachment: Attachment;
  label?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const [, startTransition] = useTransition();
  const router = useRouter();

  function chooseFile() {
    inputRef.current?.click();
  }

  async function upload(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) {
      setStatus({ phase: "error", message: "Only image files are supported." });
      return;
    }

    setStatus({ phase: "uploading", current: 0, total: list.length });

    const supabase = createClient();
    let succeeded = 0;
    let lastError: string | null = null;

    for (let i = 0; i < list.length; i++) {
      setStatus({ phase: "uploading", current: i + 1, total: list.length });
      const file = list[i]!;

      if (file.size > MAX_PHOTO_BYTES) {
        lastError = `${file.name}: file is larger than ${MAX_MB}MB.`;
        continue;
      }
      if (!isAllowedMime(file.type)) {
        lastError = `${file.name}: unsupported file type (${file.type}).`;
        continue;
      }

      // Downscale + re-encode in the browser before uploading (PRD 17). Turns
      // a 9.2MB original into a sub-1MB stored object and yields a small thumb
      // companion for avatars/grid tiles. Undecodable formats (HEIC) and GIFs
      // pass through untouched.
      const prepared = await prepareImageForUpload(file);
      const storagePath = generatePhotoPath(prepared.outputName);

      // Direct browser → Supabase Storage upload. This bypasses the Vercel
      // Function 4.5MB body limit that breaks Server-Action file uploads
      // in production.
      const { error: uploadError } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .upload(storagePath, prepared.display, {
          contentType: prepared.contentType,
          upsert: false,
        });
      if (uploadError) {
        lastError = `${file.name}: ${uploadError.message}`;
        continue;
      }

      // Upload the thumbnail companion best-effort: a failure here only costs
      // us the small rendition (callers fall back to the full object), so it
      // must never fail the photo itself.
      if (prepared.thumb) {
        await supabase.storage
          .from(PHOTOS_BUCKET)
          .upload(thumbPathFor(storagePath), prepared.thumb, {
            contentType: "image/jpeg",
            upsert: false,
          });
      }

      // Persist the small metadata row via Server Action.
      const result = await recordUploadedPhoto({
        storagePath,
        attachment,
      });
      if (!result.ok) {
        lastError = `${file.name}: ${result.message}`;
        continue;
      }

      succeeded += 1;
    }

    if (succeeded === 0) {
      setStatus({
        phase: "error",
        message: lastError ?? "All uploads failed.",
      });
      return;
    }

    setStatus({ phase: "done", count: succeeded });
    startTransition(() => router.refresh());
  }

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      void upload(e.target.files);
      e.target.value = "";
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void upload(e.dataTransfer.files);
    }
  }

  const isBusy = status.phase === "uploading";

  return (
    <div
      className={[
        // Bronze-rule dropzone, not a SaaS card. Quiet by default; lifts a
        // touch on drag-over.
        "group/photo-upload relative rounded-md border border-dashed border-accent-bronze/40 bg-surface/60 transition-colors",
        isDragging
          ? "border-accent-bronze/70 bg-accent-bronze/5"
          : "hover:border-accent-bronze/60 hover:bg-surface",
        className ?? "",
      ].join(" ")}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={onFiles}
      />
      <div className="flex flex-col items-center gap-3 px-5 py-8 text-center">
        <p className="eyebrow text-accent-bronze">Add to archive</p>
        <p className="max-w-sm text-sm text-foreground-muted">
          Drop photos here, or choose from your device.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isBusy}
          onClick={chooseFile}
        >
          {isBusy ? `Uploading ${status.current}/${status.total}…` : label}
        </Button>
        <p className="text-[0.6875rem] text-foreground-subtle">
          JPG, PNG, WebP, GIF, HEIC · up to {MAX_MB}MB each · large photos are
          optimized for fast loading
        </p>
        {status.phase === "error" && (
          <p className="text-xs text-destructive">{status.message}</p>
        )}
        {status.phase === "done" && (
          <p className="text-xs text-foreground-muted">
            Added {status.count} photo{status.count === 1 ? "" : "s"}.
          </p>
        )}
      </div>
    </div>
  );
}
