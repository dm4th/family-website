"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/confirm-button";
import {
  deleteTrustDocument,
  grantTrustAccess,
  openTrustDocument,
  revokeTrustAccess,
} from "./actions";

/** A person who can be offered access, or already holds it. */
export type TrustPerson = { id: string; name: string };

/**
 * Open one document in a new tab. The server action writes the `viewed` audit
 * row before minting a five-minute signed URL — an open that can't be logged
 * doesn't happen, and this button surfaces that honestly.
 */
export function OpenDocumentButton({ documentId }: { documentId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await openTrustDocument(documentId);
          if (result.ok) {
            window.open(result.url, "_blank", "noopener,noreferrer");
          } else {
            toast.error("Couldn't open the document", {
              description: result.message,
            });
          }
        })
      }
    >
      {pending ? "Opening…" : "Open"}
    </Button>
  );
}

/**
 * Manager-only: who can see this document. Every name here is an explicit
 * grant — there is no "everyone" — and adding or removing one is audited.
 */
export function ShareControls({
  documentId,
  documentName,
  grants,
  people,
}: {
  documentId: string;
  documentName: string;
  grants: TrustPerson[];
  people: TrustPerson[];
}) {
  const [selected, setSelected] = useState("");
  const [pending, startTransition] = useTransition();

  const granted = new Set(grants.map((g) => g.id));
  const candidates = people.filter((p) => !granted.has(p.id));

  return (
    <div className="flex flex-col gap-3">
      {grants.length === 0 ? (
        <p className="text-sm text-foreground-subtle">
          Only trust managers can see this document.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {grants.map((g) => (
            <li
              key={g.id}
              className="flex items-center gap-1.5 rounded-sm border border-accent-advisory/25 bg-accent-advisory-soft px-2.5 py-1 text-sm text-accent-advisory"
            >
              {g.name}
              <ConfirmButton
                triggerVariant="ghost"
                triggerSize="icon-sm"
                triggerClassName="size-8 text-accent-advisory hover:text-destructive"
                triggerAriaLabel={`Remove ${g.name}'s access`}
                title="Remove This Access?"
                description={`${g.name} will no longer be able to open "${documentName}". This is recorded in the activity log.`}
                confirmLabel="Remove Access"
                pendingLabel="Removing…"
                errorTitle="Couldn't remove the access"
                onConfirm={async () => {
                  const result = await revokeTrustAccess(documentId, g.id);
                  if (!result.ok) throw new Error(result.message);
                }}
              >
                ×
              </ConfirmButton>
            </li>
          ))}
        </ul>
      )}

      {candidates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`share-${documentId}`}>
            Share with
          </label>
          <select
            id={`share-${documentId}`}
            value={selected}
            disabled={pending}
            onChange={(e) => setSelected(e.target.value)}
            className="h-10 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
          >
            <option value="">Choose a person…</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || !selected}
            onClick={() =>
              startTransition(async () => {
                const result = await grantTrustAccess(documentId, selected);
                if (result.ok) {
                  toast.success("Access granted.");
                  setSelected("");
                } else {
                  toast.error("Couldn't share the document", {
                    description: result.message,
                  });
                }
              })
            }
          >
            {pending ? "Sharing…" : "Share"}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Manager-only: remove a document, its stored file, grants, and page text. */
export function DeleteDocumentButton({
  documentId,
  documentName,
}: {
  documentId: string;
  documentName: string;
}) {
  return (
    <ConfirmButton
      triggerVariant="ghost"
      triggerSize="sm"
      triggerClassName="text-foreground-muted hover:text-destructive"
      title="Remove This Document?"
      description={`"${documentName}" and its stored file will be removed for everyone, and every access grant with it. The activity log keeps a record. This cannot be undone.`}
      confirmLabel="Remove Document"
      pendingLabel="Removing…"
      destructive
      successMessage="Document removed."
      errorTitle="Couldn't remove the document"
      onConfirm={() => deleteTrustDocument(documentId)}
    >
      Remove
    </ConfirmButton>
  );
}
