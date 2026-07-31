"use client";

/**
 * "Documents We've Read" (PRD 33).
 *
 * The retention half of Smart Intake. Every bill, note, and statement a member
 * photographs is kept in a private bucket with a provenance row, and until this
 * panel existed neither could be seen or removed from the app. These documents
 * carry account numbers, policy numbers, and amounts, so accumulating them
 * invisibly and forever was the wrong default.
 *
 * Rows are server-loaded (see `loadIntakeDocuments`); this component only opens
 * and removes. Removal is one action covering the stored photo and the record of
 * it together, behind the house confirm.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/confirm-button";
import { Eyebrow } from "@/components/shell";
import {
  formatByteSize,
  intakeKindLabel,
  type IntakeDocumentRow,
} from "@/lib/intake/document-view";
import { deleteIntakeDocument, intakeDocumentUrl } from "./actions";

export function DocumentsPanel({
  documents,
}: {
  documents: IntakeDocumentRow[];
}) {
  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <Eyebrow>Retention</Eyebrow>
        <h2 className="font-display text-lg leading-tight text-foreground">
          Documents We&rsquo;ve Read
        </h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Every photo read for this property is kept so you can check it against
          what was filled in. Remove any you no longer need.
        </p>
      </div>

      {documents.length === 0 ? (
        <p className="px-5 py-6 text-sm italic text-foreground-subtle sm:px-6">
          Nothing read yet for this property.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {documents.map((doc) => (
            <DocumentRowItem key={doc.id} doc={doc} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DocumentRowItem({ doc }: { doc: IntakeDocumentRow }) {
  const router = useRouter();
  const [opening, startOpening] = useTransition();
  // Kept so a removed row disappears immediately, before the server round-trip
  // that refreshes the list settles.
  const [removed, setRemoved] = useState(false);

  if (removed) return null;

  function handleOpen() {
    startOpening(async () => {
      const result = await intakeDocumentUrl(doc.id);
      if (result.status === "error") {
        toast.error("Couldn't open this document", {
          description: result.message,
        });
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 sm:px-6">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">{intakeKindLabel(doc.intent)}</p>
        <p className="mt-1 text-xs text-foreground-subtle">
          {formatDate(doc.createdAt)} · {doc.uploaderName}
          {doc.objectMissing ? "" : ` · ${formatByteSize(doc.byteSize)}`}
        </p>
        {doc.objectMissing && (
          <p className="mt-1 text-xs text-accent-bronze">
            Photo no longer stored. Removing this clears the leftover record.
          </p>
        )}
      </div>
      <div className="flex items-center gap-1">
        {!doc.objectMissing && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleOpen}
            disabled={opening}
          >
            {opening ? "Opening…" : "Open"}
          </Button>
        )}
        {doc.canDelete && (
          <ConfirmButton
            triggerVariant="ghost"
            triggerSize="sm"
            title="Remove this document?"
            description={
              doc.objectMissing
                ? "This clears the leftover record. The photo itself is already gone."
                : "The photo is deleted for everyone, not just you, and can't be brought back. Anything already saved from it stays where it is."
            }
            confirmLabel="Remove Document"
            cancelLabel="Keep It"
            pendingLabel="Removing…"
            destructive
            successMessage="The document was removed."
            errorTitle="Couldn't remove this document"
            onConfirm={async () => {
              await deleteIntakeDocument(doc.id);
              setRemoved(true);
              router.refresh();
            }}
          >
            Remove
          </ConfirmButton>
        )}
      </div>
    </li>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
