"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { prepareImageForUpload } from "@/lib/image-resize";
import {
  MAX_TRUST_BYTES,
  TRUST_BUCKET,
  generateTrustPath,
  type TrustUploadKind,
} from "@/lib/trust/shared";
import { registerTrustDocument } from "./actions";

const MAX_MB = Math.round(MAX_TRUST_BYTES / 1024 / 1024);

/**
 * The manager upload surface (PRD 40): two large, unmistakable drop zones side
 * by side, built for Dad's real workflow — select a batch in the Dropbox
 * folder on a desktop and drag the lot.
 *
 * Files are routed by what they ARE, not just where they landed: an image
 * dropped on the Trust Documents zone is quietly filed as a notebook page (and
 * the result line says so) rather than erroring. A PDF is taken at its word —
 * it belongs to whichever zone received it, since scanners emit PDFs too.
 *
 * Upload is direct browser → Supabase Storage (managers only, enforced by the
 * bucket's RLS insert policy), then `registerTrustDocument` turns the object
 * into a vault row + audit event. Per-file progress while running; a per-file
 * success/failure list at the end — no silent partial batches.
 */

type FileOutcome = {
  name: string;
  status: "added" | "failed";
  /** Set when the file was filed to a different zone than it was dropped on. */
  rerouted?: TrustUploadKind;
  message?: string;
};

type Status =
  | { phase: "idle" }
  | { phase: "uploading"; current: number; total: number }
  | { phase: "done"; outcomes: FileOutcome[] };

function routeFile(
  file: File,
  droppedOn: TrustUploadKind,
): TrustUploadKind | null {
  const type = file.type.toLowerCase();
  if (type === "application/pdf") return droppedOn;
  if (type.startsWith("image/")) return "scan";
  return null;
}

export function TrustUpload() {
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const [, startTransition] = useTransition();
  const router = useRouter();

  const isBusy = status.phase === "uploading";

  async function uploadBatch(files: File[], droppedOn: TrustUploadKind) {
    if (files.length === 0 || isBusy) return;
    setStatus({ phase: "uploading", current: 0, total: files.length });

    const supabase = createClient();
    const outcomes: FileOutcome[] = [];

    for (let i = 0; i < files.length; i++) {
      setStatus({ phase: "uploading", current: i + 1, total: files.length });
      const file = files[i]!;

      // One file's failure must never strand the rest of the batch (a network
      // blip mid-drag of 40 PDFs would otherwise freeze the progress line and
      // swallow every outcome — the silent partial batch the PRD forbids).
      try {
        const kind = routeFile(file, droppedOn);
        if (!kind) {
          outcomes.push({
            name: file.name,
            status: "failed",
            message: "Only PDF files and photos can be added.",
          });
          continue;
        }
        if (file.size > MAX_TRUST_BYTES) {
          outcomes.push({
            name: file.name,
            status: "failed",
            message: `Larger than ${MAX_MB}MB.`,
          });
          continue;
        }

        // Notebook photos go through the same in-browser downscale as the
        // photo pipeline (HEIC included, when decodable) — smaller stored
        // objects and a format slice 3's OCR can actually read. PDFs upload
        // as-is.
        let blob: Blob = file;
        let contentType = file.type;
        let outputName = file.name;
        if (kind === "scan" && file.type.startsWith("image/")) {
          const prepared = await prepareImageForUpload(file);
          blob = prepared.display;
          contentType = prepared.contentType;
          outputName = prepared.outputName;
          // A HEIC this browser couldn't decode passes through unconverted,
          // and the notebook reader can't read HEIC — storing it would hand
          // Dad a dead end at review time. Fail it now, with the fix in the
          // message (PR #54 review).
          if (/hei[cf]/.test(contentType)) {
            outcomes.push({
              name: file.name,
              status: "failed",
              message:
                "This photo is in a format we can't read later. Please re-take it, or export it as a JPG and try again.",
            });
            continue;
          }
        }

        const storagePath = generateTrustPath(kind, outputName);
        const { error: uploadError } = await supabase.storage
          .from(TRUST_BUCKET)
          .upload(storagePath, blob, { contentType, upsert: false });
        if (uploadError) {
          outcomes.push({
            name: file.name,
            status: "failed",
            message: uploadError.message,
          });
          continue;
        }

        const result = await registerTrustDocument({
          storagePath,
          name: file.name,
          contentType,
        });
        if (!result.ok) {
          outcomes.push({ name: file.name, status: "failed", message: result.message });
          continue;
        }

        outcomes.push({
          name: file.name,
          status: "added",
          rerouted: kind !== droppedOn ? kind : undefined,
        });
      } catch {
        outcomes.push({
          name: file.name,
          status: "failed",
          message: "Something went wrong with this file. Please try it again.",
        });
      }
    }

    setStatus({ phase: "done", outcomes });
    startTransition(() => router.refresh());
  }

  const added =
    status.phase === "done"
      ? status.outcomes.filter((o) => o.status === "added").length
      : 0;
  const failed =
    status.phase === "done"
      ? status.outcomes.filter((o) => o.status === "failed").length
      : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <DropZone
          kind="document"
          title="Trust Documents"
          description="The trust's digital originals. Drag PDFs here, straight from the old Dropbox folder."
          formats={`PDF · up to ${MAX_MB}MB each`}
          disabled={isBusy}
          onFiles={(files) => void uploadBatch(files, "document")}
        />
        <DropZone
          kind="scan"
          title="Notebook Pages"
          description="Photos or scans of the handwritten notebook. Reading and review come next; for now they are stored safely."
          formats="JPG, PNG, HEIC, or scanned PDF"
          disabled={isBusy}
          onFiles={(files) => void uploadBatch(files, "scan")}
        />
      </div>

      <div aria-live="polite" className="flex flex-col gap-2">
        {status.phase === "uploading" && (
          <p className="text-sm text-foreground-muted">
            Adding file {status.current} of {status.total}…
          </p>
        )}
        {status.phase === "done" && (
          <>
            <p className="text-sm text-foreground">
              {added > 0 &&
                `${added} file${added === 1 ? "" : "s"} added. ${
                  added === 1 ? "It is" : "They are"
                } listed below.`}
              {added > 0 && failed > 0 && " "}
              {failed > 0 &&
                `${failed} file${failed === 1 ? "" : "s"} couldn't be added.`}
            </p>
            <ul className="flex flex-col gap-1">
              {status.outcomes.map((o, i) => (
                <li
                  key={`${o.name}-${i}`}
                  className={
                    o.status === "failed"
                      ? "text-sm text-destructive"
                      : "text-sm text-foreground-muted"
                  }
                >
                  {o.name}
                  {o.status === "added" && o.rerouted === "scan"
                    ? " · added to Notebook Pages (it's a photo)"
                    : o.status === "added"
                      ? " · added"
                      : ` · ${o.message ?? "failed"}`}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function DropZone({
  kind,
  title,
  description,
  formats,
  disabled,
  onFiles,
}: {
  kind: TrustUploadKind;
  title: string;
  description: string;
  formats: string;
  disabled: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      className={[
        // The advisory take on the bronze-rule dropzone: generous, calm, and
        // impossible to mistake for its sibling — each zone leads with its own
        // eyebrow + title and a plain-words description.
        "relative flex flex-col items-center gap-3 rounded-sm border border-dashed px-6 py-10 text-center transition-colors",
        isDragging
          ? "border-accent-advisory bg-accent-advisory-soft/60"
          : "border-accent-advisory/40 bg-surface/60 hover:border-accent-advisory/70 hover:bg-surface",
      ].join(" ")}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.length) {
          onFiles(Array.from(e.dataTransfer.files));
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={kind === "document" ? "application/pdf" : "image/*,application/pdf"}
        multiple
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.length) {
            onFiles(Array.from(e.target.files));
            e.target.value = "";
          }
        }}
      />
      <p className="eyebrow text-accent-advisory">
        {kind === "document" ? "The originals" : "The notebook"}
      </p>
      <p className="font-display text-xl text-foreground">{title}</p>
      <p className="max-w-xs text-sm leading-relaxed text-foreground-muted">
        {description}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        Choose Files
      </Button>
      <p className="text-sm text-foreground-subtle">{formats}</p>
    </div>
  );
}
