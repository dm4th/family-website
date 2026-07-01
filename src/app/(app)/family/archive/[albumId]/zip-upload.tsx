"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import {
  PHOTOS_BUCKET,
  MAX_PHOTO_BYTES,
  generatePhotoPath,
  thumbPathFor,
} from "@/lib/photo-utils";
import { prepareImageForUpload } from "@/lib/image-resize";
import { recordUploadedPhoto } from "@/app/(app)/photos/actions";
import { PeoplePicker } from "@/components/authoring/people-picker";
import { tagPhotosWithPeople } from "../actions";

const MAX_MB = Math.round(MAX_PHOTO_BYTES / 1024 / 1024);

// Extension → MIME for entries pulled out of the zip (zip metadata has no MIME).
// Only these are treated as photos; everything else in the archive is skipped.
const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
};

function inferMime(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  return EXT_TO_MIME[name.slice(dot + 1).toLowerCase()] ?? null;
}

function baseName(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(slash + 1) : path;
}

/** Format a Date as a local YYYY-MM-DD (matches the taken_on date column). */
function toIsoDay(d: Date): string | null {
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Failure = { name: string; reason: string };

type Status =
  | { phase: "idle" }
  | { phase: "unzipping" }
  | { phase: "uploading"; current: number; total: number; name: string }
  | { phase: "done"; succeeded: string[]; failures: Failure[] }
  | { phase: "error"; message: string };

/**
 * ZipUpload — drop a .zip of scans into an album and have every image go
 * through the exact same client downscale + 400px thumb + direct-to-Storage
 * pipeline as the single uploader (PRD 18, slice 2). The bytes never touch a
 * Vercel Function, so the 4.5MB body limit and PRD-17 renditions both hold.
 *
 * Resilient by design: a corrupt image or a non-image file is skipped and
 * reported, never aborting the rest of the batch. EXIF dates prefill each
 * photo's `taken_on`; an optional "era for all" fills `circa` on the undated.
 */
export function ZipUpload({ albumId }: { albumId: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [circaForAll, setCircaForAll] = useState("");
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function run(file: File) {
    setStatus({ phase: "unzipping" });

    // Load the heavy client libs only when the feature is actually used, so the
    // album page's initial bundle stays lean.
    let entries: { name: string; blob: Blob }[];
    try {
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(file);
      const raw = Object.values(zip.files).filter((e) => {
        if (e.dir) return false;
        const bn = baseName(e.name);
        // Skip macOS resource forks, dotfiles, and non-image entries.
        if (e.name.startsWith("__MACOSX/") || bn.startsWith(".")) return false;
        return inferMime(bn) !== null;
      });
      entries = [];
      for (const e of raw) {
        entries.push({ name: baseName(e.name), blob: await e.async("blob") });
      }
    } catch (err) {
      setStatus({
        phase: "error",
        message:
          err instanceof Error
            ? `Could not read the zip: ${err.message}`
            : "Could not read the zip file.",
      });
      return;
    }

    if (entries.length === 0) {
      setStatus({
        phase: "error",
        message: "No images found in that zip (looked for JPG, PNG, WebP, GIF, HEIC).",
      });
      return;
    }

    // EXIF reader, also lazy-loaded.
    let readExif: (blob: Blob) => Promise<string | null>;
    try {
      const exifrMod = await import("exifr");
      const exifr = (exifrMod as { default?: unknown }).default ?? exifrMod;
      readExif = async (blob: Blob) => {
        try {
          const out = (await (exifr as { parse: (b: Blob, opts: string[]) => Promise<Record<string, unknown>> }).parse(
            blob,
            ["DateTimeOriginal"],
          )) as { DateTimeOriginal?: Date } | undefined;
          const d = out?.DateTimeOriginal;
          return d instanceof Date ? toIsoDay(d) : null;
        } catch {
          return null;
        }
      };
    } catch {
      readExif = async () => null; // EXIF is a nicety, never a blocker.
    }

    const supabase = createClient();
    const succeeded: string[] = [];
    const failures: Failure[] = [];
    const batchCirca = circaForAll.trim() || null;

    for (let i = 0; i < entries.length; i++) {
      const { name, blob } = entries[i]!;
      setStatus({ phase: "uploading", current: i + 1, total: entries.length, name });

      try {
        if (blob.size > MAX_PHOTO_BYTES) {
          failures.push({ name, reason: `larger than ${MAX_MB}MB` });
          continue;
        }
        const mime = inferMime(name);
        if (!mime) {
          failures.push({ name, reason: "not an image" });
          continue;
        }

        const file = new File([blob], name, { type: mime });
        const takenOn = await readExif(file);

        // Same downscale + thumb + direct-to-Storage path the single uploader uses.
        const prepared = await prepareImageForUpload(file);
        const storagePath = generatePhotoPath(prepared.outputName);

        const { error: uploadError } = await supabase.storage
          .from(PHOTOS_BUCKET)
          .upload(storagePath, prepared.display, {
            contentType: prepared.contentType,
            upsert: false,
          });
        if (uploadError) {
          failures.push({ name, reason: uploadError.message });
          continue;
        }

        if (prepared.thumb) {
          try {
            await supabase.storage
              .from(PHOTOS_BUCKET)
              .upload(thumbPathFor(storagePath), prepared.thumb, {
                contentType: "image/jpeg",
                upsert: false,
              });
          } catch {
            // Thumb is best-effort; the display object is already stored.
          }
        }

        const result = await recordUploadedPhoto({
          storagePath,
          attachment: { kind: "album", albumId },
          takenOn,
          circa: takenOn ? null : batchCirca,
        });
        if (!result.ok) {
          failures.push({ name, reason: result.message });
          continue;
        }
        succeeded.push(result.photoId);
      } catch (err) {
        failures.push({
          name,
          reason: err instanceof Error ? err.message : "unexpected error",
        });
      }
    }

    setStatus({ phase: "done", succeeded, failures });
    if (succeeded.length > 0) startTransition(() => router.refresh());
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void run(file);
  }

  const busy = status.phase === "unzipping" || status.phase === "uploading";

  return (
    <div className="flex flex-col gap-4 rounded-md border border-dashed border-accent-bronze/40 bg-surface/60 px-5 py-6">
      <div className="flex flex-col gap-1">
        <p className="eyebrow text-accent-bronze">Upload a zip</p>
        <p className="max-w-prose text-sm text-foreground-muted">
          Have a folder of scans? Zip it and drop it here to add every photo at
          once. Dates are read from each photo when available.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="circa-all" className="text-xs text-foreground-subtle">
          Approximate date for undated photos (optional)
        </label>
        <Input
          id="circa-all"
          value={circaForAll}
          placeholder="e.g., 1970s, summer 1972"
          disabled={busy}
          onChange={(e) => setCircaForAll(e.target.value)}
          className="max-w-[20rem]"
        />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        className="sr-only"
        onChange={onFile}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {status.phase === "unzipping"
            ? "Reading Zip…"
            : status.phase === "uploading"
              ? `Uploading ${status.current}/${status.total}…`
              : "Choose a Zip File"}
        </Button>
        <p className="text-[0.6875rem] text-foreground-subtle">
          Images only · up to {MAX_MB}MB each · large photos are optimized for fast loading
        </p>
      </div>

      {status.phase === "uploading" && (
        <p className="truncate text-xs text-foreground-subtle">{status.name}</p>
      )}

      {status.phase === "error" && (
        <p className="text-sm text-destructive">{status.message}</p>
      )}

      {status.phase === "done" && (
        <ZipResult
          albumId={albumId}
          succeeded={status.succeeded}
          failures={status.failures}
        />
      )}
    </div>
  );
}

function ZipResult({
  albumId,
  succeeded,
  failures,
}: {
  albumId: string;
  succeeded: string[];
  failures: Failure[];
}) {
  const [tagState, setTagState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [tagError, setTagError] = useState<string | null>(null);
  const router = useRouter();

  async function onTag(formData: FormData) {
    const personIds = formData
      .getAll("people")
      .filter((v): v is string => typeof v === "string");
    if (personIds.length === 0 || succeeded.length === 0) return;
    setTagState("saving");
    setTagError(null);
    const result = await tagPhotosWithPeople(albumId, succeeded, personIds);
    if (result.ok) {
      setTagState("saved");
      router.refresh();
    } else {
      setTagState("error");
      setTagError(result.message);
    }
  }

  return (
    <div className="flex flex-col gap-4 border-t border-border/60 pt-4">
      <p className="text-sm text-foreground">
        Added <span className="font-medium">{succeeded.length}</span>{" "}
        photo{succeeded.length === 1 ? "" : "s"}
        {failures.length > 0 ? `, skipped ${failures.length}` : ""}.
      </p>

      {failures.length > 0 && (
        <details className="text-xs text-foreground-subtle">
          <summary className="cursor-pointer">Show skipped files</summary>
          <ul className="mt-2 space-y-0.5">
            {failures.map((f, i) => (
              <li key={i}>
                <span className="text-foreground-muted">{f.name}</span>: {f.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      {succeeded.length > 0 && tagState !== "saved" && (
        <form action={onTag} className="flex flex-col gap-2">
          <label className="text-xs text-foreground-subtle">
            Tag everyone in this batch (optional)
          </label>
          <PeoplePicker
            name="people"
            placeholder="Search by name…"
            inputAriaLabel="Tag people in these photos"
          />
          <div>
            <Button type="submit" size="sm" variant="outline" disabled={tagState === "saving"}>
              {tagState === "saving" ? "Tagging…" : "Tag These Photos"}
            </Button>
          </div>
          {tagError && <p className="text-sm text-destructive">{tagError}</p>}
        </form>
      )}

      {tagState === "saved" && (
        <p className="text-sm text-foreground-muted">
          Tagged. Open any photo to fine-tune who&apos;s in it.
        </p>
      )}
    </div>
  );
}
