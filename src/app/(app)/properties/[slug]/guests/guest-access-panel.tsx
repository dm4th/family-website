"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eyebrow } from "@/components/shell";
import {
  grantGuestAccess,
  revokeGuestAccess,
  type GrantGuestState,
} from "./actions";

const initial: GrantGuestState = { status: "idle" };

export type GuestGrantRow = {
  profileId: string;
  fullName: string | null;
  email: string;
};

/**
 * Member-facing "Add a guest" surface for a single property (PRD 15 §4). Lists
 * current guests, lets any member grant access by email, and revoke. Rendered
 * only for members/admins (never guests).
 */
export function GuestAccessPanel({
  propertyId,
  propertySlug,
  propertyName,
  guests,
}: {
  propertyId: string;
  propertySlug: string;
  propertyName: string;
  guests: GuestGrantRow[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-foreground-muted">
        Guests can sign in and see only this property — its details, contacts,
        photos, and availability. They can&apos;t see the family directory,
        other properties, or who else is staying.
      </p>

      {guests.length === 0 ? (
        <p className="text-sm italic text-foreground-subtle">
          No guests have access yet.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {guests.map((g) => (
            <GuestRow
              key={g.profileId}
              guest={g}
              propertyId={propertyId}
              propertySlug={propertySlug}
            />
          ))}
        </ul>
      )}

      <AddGuestForm
        propertyId={propertyId}
        propertySlug={propertySlug}
        propertyName={propertyName}
      />
    </div>
  );
}

function GuestRow({
  guest,
  propertyId,
  propertySlug,
}: {
  guest: GuestGrantRow;
  propertyId: string;
  propertySlug: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm text-foreground">
          {guest.fullName ?? "Invited guest"}
        </div>
        <div className="truncate text-xs text-foreground-subtle">
          {guest.email}
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={isPending}
        className="text-destructive hover:text-destructive"
        onClick={() => {
          if (
            !confirm(
              `Revoke ${guest.fullName ?? guest.email}'s access to this property?`,
            )
          )
            return;
          startTransition(async () => {
            try {
              await revokeGuestAccess(propertyId, guest.profileId, propertySlug);
              router.refresh();
            } catch (err) {
              alert(err instanceof Error ? err.message : "Failed");
            }
          });
        }}
      >
        {isPending ? "Revoking…" : "Revoke"}
      </Button>
    </li>
  );
}

function AddGuestForm({
  propertyId,
  propertySlug,
  propertyName,
}: {
  propertyId: string;
  propertySlug: string;
  propertyName: string;
}) {
  const action = grantGuestAccess.bind(null, propertyId, propertySlug);
  const [state, formAction, isPending] = useActionState(action, initial);
  const done = state.status === "granted" || state.status === "invited";

  return (
    <form
      action={formAction}
      key={done ? "reset" : "stable"}
      className="flex flex-col gap-4 rounded-md border border-dashed border-accent-bronze/40 bg-surface/60 p-4"
    >
      <Eyebrow>Add a guest</Eyebrow>
      <div className="flex flex-col gap-2">
        <Label htmlFor="guest-email" className="sr-only">
          Guest email
        </Label>
        <Input
          id="guest-email"
          name="email"
          type="email"
          required
          placeholder="guest@example.com"
          autoComplete="off"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-foreground-subtle" aria-live="polite">
          {state.status === "granted" &&
            `${state.email} now has access to ${propertyName}.`}
          {state.status === "invited" &&
            `Invited ${state.email} — they'll appear here once they sign in.`}
          {state.status === "error" && (
            <span className="text-destructive">{state.message}</span>
          )}
        </p>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Adding…" : "Add guest"}
        </Button>
      </div>
    </form>
  );
}
