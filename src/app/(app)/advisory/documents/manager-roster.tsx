"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/confirm-button";
import { addTrustManager, removeTrustManager } from "./actions";
import type { TrustPerson } from "./document-controls";

/**
 * The trust-manager roster (site-admin controls, per the PRD 40 grid: admins
 * seat and unseat managers — the bootstrap — but the seat itself is what
 * carries document power). Every change is audited.
 */
export function ManagerRoster({
  managers,
  candidates,
  canEdit,
}: {
  managers: TrustPerson[];
  candidates: TrustPerson[];
  canEdit: boolean;
}) {
  const [selected, setSelected] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      {managers.length === 0 ? (
        <p className="text-sm text-foreground-muted">
          No trust managers are seated yet. A site admin adds the first ones
          here; managers are the only people who can add documents and share
          them.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {managers.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-1.5 rounded-sm border border-border bg-surface px-2.5 py-1 text-sm text-foreground"
            >
              {m.name}
              {canEdit && (
                <ConfirmButton
                  triggerVariant="ghost"
                  triggerSize="icon-sm"
                  triggerClassName="size-8 text-foreground-muted hover:text-destructive"
                  triggerAriaLabel={`Remove ${m.name} as a trust manager`}
                  title="Remove This Manager?"
                  description={`${m.name} will no longer be able to add, share, or remove trust documents. Their document access grants, if any, are unchanged. This is recorded in the activity log.`}
                  confirmLabel="Remove Manager"
                  pendingLabel="Removing…"
                  errorTitle="Couldn't remove the manager"
                  onConfirm={() => removeTrustManager(m.id)}
                >
                  ×
                </ConfirmButton>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && candidates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="add-trust-manager">
            Add a trust manager
          </label>
          <select
            id="add-trust-manager"
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
                const result = await addTrustManager(selected);
                if (result.ok) {
                  toast.success("Manager added.");
                  setSelected("");
                } else {
                  toast.error("Couldn't add the manager", {
                    description: result.message,
                  });
                }
              })
            }
          >
            {pending ? "Adding…" : "Add Manager"}
          </Button>
        </div>
      )}
    </div>
  );
}
