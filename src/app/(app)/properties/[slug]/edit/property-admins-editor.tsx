"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Eyebrow } from "@/components/shell";
import {
  addPropertyAdmin,
  removePropertyAdmin,
  type PropertyAdminActionState,
} from "../admins/actions";

const initial: PropertyAdminActionState = { status: "idle" };

export type PropertyAdminRow = {
  profileId: string;
  fullName: string | null;
  email: string;
};

export type AdminCandidate = {
  id: string;
  fullName: string | null;
  email: string;
};

export function PropertyAdminsEditor({
  propertyId,
  propertySlug,
  admins,
  candidates,
  canManage,
}: {
  propertyId: string;
  propertySlug: string;
  admins: PropertyAdminRow[];
  candidates: AdminCandidate[];
  canManage: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      {admins.length === 0 ? (
        <p className="text-sm italic text-foreground-subtle">
          No property admins yet.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {admins.map((a) => (
            <AdminRow
              key={a.profileId}
              admin={a}
              propertyId={propertyId}
              propertySlug={propertySlug}
              canManage={canManage}
            />
          ))}
        </ul>
      )}

      {canManage && (
        <AddAdminForm
          propertyId={propertyId}
          propertySlug={propertySlug}
          candidates={candidates}
        />
      )}
    </div>
  );
}

function AdminRow({
  admin,
  propertyId,
  propertySlug,
  canManage,
}: {
  admin: PropertyAdminRow;
  propertyId: string;
  propertySlug: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm text-foreground">
          {admin.fullName ?? "Unnamed"}
        </div>
        <div className="truncate text-xs text-foreground-subtle">
          {admin.email}
        </div>
      </div>
      {canManage && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isPending}
          className="text-destructive hover:text-destructive"
          onClick={() => {
            if (
              !confirm(
                `Remove ${admin.fullName ?? admin.email} as a property admin?`,
              )
            )
              return;
            startTransition(async () => {
              try {
                await removePropertyAdmin(
                  propertyId,
                  propertySlug,
                  admin.profileId,
                );
                router.refresh();
              } catch (err) {
                alert(err instanceof Error ? err.message : "Failed");
              }
            });
          }}
        >
          {isPending ? "Removing…" : "Remove"}
        </Button>
      )}
    </li>
  );
}

function AddAdminForm({
  propertyId,
  propertySlug,
  candidates,
}: {
  propertyId: string;
  propertySlug: string;
  candidates: AdminCandidate[];
}) {
  const action = addPropertyAdmin.bind(null, propertyId, propertySlug);
  const [state, formAction, isPending] = useActionState(action, initial);

  if (candidates.length === 0) {
    return (
      <p className="text-xs italic text-foreground-subtle">
        Everyone is already a property admin.
      </p>
    );
  }

  return (
    <form
      action={formAction}
      key={state.status === "added" ? "reset" : "stable"}
      className="flex flex-col gap-4 rounded-md border border-dashed border-accent-bronze/40 bg-surface/60 p-4"
    >
      <Eyebrow>Add a property admin</Eyebrow>
      <div className="flex flex-col gap-2">
        <Label htmlFor="add-admin" className="sr-only">
          Choose a family member
        </Label>
        <select
          id="add-admin"
          name="profile_id"
          required
          defaultValue=""
          className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <option value="" disabled>
            Pick a family member…
          </option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {(c.fullName ?? c.email)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-end gap-3">
        {state.status === "error" && (
          <p className="text-sm text-destructive">{state.message}</p>
        )}
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Adding…" : "Add"}
        </Button>
      </div>
    </form>
  );
}
