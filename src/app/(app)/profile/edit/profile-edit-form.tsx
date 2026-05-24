"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateOwnProfile,
  type ProfileFormState,
} from "../actions";

const initialState: ProfileFormState = { status: "idle" };

export type ProfileFormValues = {
  id: string;
  fullName: string | null;
  familyBranch: string | null;
  generation: number | null;
  relationshipNotes: string | null;
  phone: string | null;
  bio: string | null;
};

export function ProfileEditForm({ profile }: { profile: ProfileFormValues }) {
  const [state, formAction, isPending] = useActionState(
    updateOwnProfile,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-6">
      <Field label="Full name" htmlFor="full_name">
        <Input
          id="full_name"
          name="full_name"
          defaultValue={profile.fullName ?? ""}
          autoComplete="name"
        />
      </Field>

      <Field
        label="Family branch"
        htmlFor="family_branch"
        hint="Which of the three sibling families you belong to."
      >
        <Input
          id="family_branch"
          name="family_branch"
          defaultValue={profile.familyBranch ?? ""}
          placeholder="e.g., Peter's family"
        />
      </Field>

      <Field
        label="Generation"
        htmlFor="generation"
        hint="1 = siblings, 2 = grandchildren + spouses, 3 = great-grandchildren."
      >
        <Input
          id="generation"
          name="generation"
          type="number"
          min={1}
          max={5}
          defaultValue={profile.generation ?? ""}
          className="max-w-[6rem]"
        />
      </Field>

      <Field
        label="Relationship notes"
        htmlFor="relationship_notes"
        hint='Free-text. e.g., "spouse of Sarah", "son of Peter & Mary".'
      >
        <Input
          id="relationship_notes"
          name="relationship_notes"
          defaultValue={profile.relationshipNotes ?? ""}
        />
      </Field>

      <Field label="Phone" htmlFor="phone">
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          defaultValue={profile.phone ?? ""}
        />
      </Field>

      <Field label="Bio" htmlFor="bio" hint="A few sentences. Optional.">
        <textarea
          id="bio"
          name="bio"
          rows={4}
          defaultValue={profile.bio ?? ""}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:border-ring"
        />
      </Field>

      <div className="flex items-center justify-between gap-3 pt-2">
        <Link
          href={`/family/${profile.id}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Manage your photos →
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>

      {state.status === "saved" && (
        <p className="text-sm text-emerald-600">Saved.</p>
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
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
