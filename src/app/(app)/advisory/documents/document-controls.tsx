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
 * Open one document: audited signed URL from the server action, then show it.
 *
 * The tab is opened SYNCHRONOUSLY inside the click gesture and pointed at the
 * document once the URL arrives — `window.open` after an await is silently
 * killed by popup blockers (Safari above all), which is exactly the
 * "I click Open and nothing happens" Dad reported on desktop. When even the
 * synchronous open is blocked, fall back to navigating this tab: the document
 * always opens, and the back button returns to the register.
 */
function useOpenDocument(documentId: string) {
  const [pending, startTransition] = useTransition();

  function open() {
    if (pending) return;
    const tab = window.open("", "_blank");
    startTransition(async () => {
      const result = await openTrustDocument(documentId);
      if (!result.ok) {
        tab?.close();
        toast.error("Couldn't open the document", { description: result.message });
        return;
      }
      if (tab) {
        tab.location.href = result.url;
      } else {
        window.location.href = result.url;
      }
    });
  }

  return { pending, open };
}

export function OpenDocumentButton({ documentId }: { documentId: string }) {
  const { pending, open } = useOpenDocument(documentId);
  return (
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={open}>
      {pending ? "Opening…" : "Open"}
    </Button>
  );
}

/**
 * The document's name as the open affordance. Older users click the name, not
 * a button off to the side (PRD 29 posture: the obvious thing should work),
 * so the name does the same audited open as the button.
 */
export function OpenDocumentName({
  documentId,
  name,
}: {
  documentId: string;
  name: string;
}) {
  const { pending, open } = useOpenDocument(documentId);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={open}
      className="min-w-0 truncate text-left text-base text-foreground underline-offset-4 hover:text-accent-advisory hover:underline disabled:opacity-60"
    >
      {pending ? "Opening…" : name}
    </button>
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
