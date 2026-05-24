"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { uploadPhoto, type UploadResult } from "@/app/(app)/photos/actions";

type Attachment =
  | { kind: "profile"; profileId: string }
  | { kind: "property"; propertyId: string };

type Status =
  | { phase: "idle" }
  | { phase: "uploading"; current: number; total: number }
  | { phase: "error"; message: string }
  | { phase: "done"; count: number };

export function PhotoUpload({
  attachment,
  label = "Add photo",
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
    const list = Array.from(files).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (list.length === 0) {
      setStatus({ phase: "error", message: "Only image files are supported." });
      return;
    }

    setStatus({ phase: "uploading", current: 0, total: list.length });

    let succeeded = 0;
    let lastError: string | null = null;

    for (let i = 0; i < list.length; i++) {
      setStatus({ phase: "uploading", current: i + 1, total: list.length });
      const file = list[i]!;
      const fd = new FormData();
      fd.set("file", file);
      fd.set("attachment", attachment.kind);
      fd.set(
        "attachmentId",
        attachment.kind === "profile"
          ? attachment.profileId
          : attachment.propertyId,
      );

      const result: UploadResult = await uploadPhoto(fd);
      if (result.ok) succeeded += 1;
      else lastError = result.message;
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
        "rounded-lg border border-dashed border-border bg-muted/30 transition-colors",
        isDragging ? "border-foreground/50 bg-muted/60" : "",
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
      <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">
          Drop photos here, or
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isBusy}
          onClick={chooseFile}
        >
          {isBusy
            ? `Uploading ${status.current}/${status.total}…`
            : label}
        </Button>
        {status.phase === "error" && (
          <p className="text-xs text-destructive">{status.message}</p>
        )}
        {status.phase === "done" && (
          <p className="text-xs text-muted-foreground">
            Uploaded {status.count} photo{status.count === 1 ? "" : "s"}.
          </p>
        )}
      </div>
    </div>
  );
}
