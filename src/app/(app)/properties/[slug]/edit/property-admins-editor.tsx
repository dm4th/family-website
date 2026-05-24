"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
    <div className="space-y-4">
      {admins.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No property admins yet.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
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
    <li className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <div className="font-medium truncate">
          {admin.fullName ?? "Unnamed"}
        </div>
        <div className="text-xs text-muted-foreground truncate">
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
      <p className="text-xs text-muted-foreground italic">
        Everyone is already a property admin.
      </p>
    );
  }

  return (
    <form
      action={formAction}
      key={state.status === "added" ? "reset" : "stable"}
      className="rounded-lg border border-dashed border-border p-3 space-y-3"
    >
      <div className="space-y-1">
        <Label htmlFor="add-admin" className="text-xs">
          Add a property admin
        </Label>
        <select
          id="add-admin"
          name="profile_id"
          required
          defaultValue=""
          className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
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
