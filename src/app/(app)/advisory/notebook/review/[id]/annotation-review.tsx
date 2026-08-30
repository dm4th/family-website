"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { approveTrustAnnotation, denyTrustAnnotation } from "../../actions";

export type ReviewAnnotation = {
  id: string;
  text: string;
  sourceQuote: string | null;
  confidence: "high" | "medium" | "low" | null;
  mappedDocumentId: string | null;
  mappedPage: number | null;
  mappingNote: string | null;
};

export type MappableDocument = { id: string; name: string };

const CONFIDENCE_COPY: Record<string, string> = {
  high: "Read clearly",
  medium: "Read with some doubt",
  low: "Hard to read",
};

/**
 * One pending point: the manager edits the wording, keeps or changes the
 * proposed document link, then approves or sets aside. What's on screen at
 * the moment of approval is exactly what is saved — the intake posture,
 * per point.
 */
export function AnnotationReviewCard({
  annotation,
  documents,
}: {
  annotation: ReviewAnnotation;
  documents: MappableDocument[];
}) {
  const [text, setText] = useState(annotation.text);
  const [docId, setDocId] = useState(annotation.mappedDocumentId ?? "");
  const [page, setPage] = useState(
    annotation.mappedPage ? String(annotation.mappedPage) : "",
  );
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(action: () => Promise<{ ok: boolean; message?: string }>, errorTitle: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(errorTitle, { description: result.message });
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <Textarea
          aria-label="The point, in your words"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={pending}
          rows={2}
          className="flex-1"
        />
        {annotation.confidence && (
          <Badge variant="advisory" className="shrink-0">
            {CONFIDENCE_COPY[annotation.confidence]}
          </Badge>
        )}
      </div>

      {annotation.sourceQuote && (
        <p className="border-l-2 border-accent-advisory/40 pl-3 text-sm italic text-foreground-muted">
          &ldquo;{annotation.sourceQuote}&rdquo;
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-foreground-muted" htmlFor={`map-${annotation.id}`}>
          Refers to
        </label>
        <select
          id={`map-${annotation.id}`}
          value={docId}
          disabled={pending}
          onChange={(e) => setDocId(e.target.value)}
          className="h-10 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
        >
          <option value="">No document</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        {docId && (
          <>
            <label className="text-sm text-foreground-muted" htmlFor={`page-${annotation.id}`}>
              page
            </label>
            <Input
              id={`page-${annotation.id}`}
              type="number"
              min={1}
              value={page}
              disabled={pending}
              onChange={(e) => setPage(e.target.value)}
              className="w-20"
            />
          </>
        )}
        {annotation.mappingNote && (
          <span className="text-xs text-foreground-subtle">{annotation.mappingNote}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending || !text.trim()}
          onClick={() =>
            run(
              () =>
                approveTrustAnnotation({
                  id: annotation.id,
                  text,
                  mappedDocumentId: docId || null,
                  mappedPage: page ? Number(page) : null,
                }),
              "Couldn't approve the point",
            )
          }
        >
          {pending ? "Working…" : "Approve"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          className="text-foreground-muted"
          onClick={() =>
            run(() => denyTrustAnnotation(annotation.id), "Couldn't set the point aside")
          }
        >
          Set Aside
        </Button>
      </div>
    </div>
  );
}
