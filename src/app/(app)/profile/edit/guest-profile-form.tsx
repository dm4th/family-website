"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateGuestProfile, type ProfileFormState } from "../actions";

const initialState: ProfileFormState = { status: "idle" };

export type GuestProfileFormValues = {
  fullName: string | null;
  phone: string | null;
};

/**
 * Guest profile editor (PRD 15-R2). Contact basics only — name + phone. A guest
 * renter isn't in the family tree, so none of the member fields (Family Branch,
 * Generation, relationship notes, Bio) appear here. Operations framing.
 */
export function GuestProfileForm({ profile }: { profile: GuestProfileFormValues }) {
  const [state, formAction, isPending] = useActionState(
    updateGuestProfile,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Field label="Full name" htmlFor="full_name">
        <Input
          id="full_name"
          name="full_name"
          defaultValue={profile.fullName ?? ""}
          autoComplete="name"
        />
      </Field>

      <Field
        label="Phone"
        htmlFor="phone"
        hint="So your host can reach you during your stay."
      >
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          defaultValue={profile.phone ?? ""}
        />
      </Field>

      <div className="mt-2 flex items-center justify-end border-t border-border pt-5">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save Changes"}
        </Button>
      </div>

      {state.status === "saved" && (
        <p className="text-sm text-accent-operations">Saved.</p>
      )}
      {state.status === "error" && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-foreground-muted">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-xs text-foreground-subtle">{hint}</p> : null}
    </div>
  );
}
