"use client";

import * as React from "react";
import { useActionState } from "react";

import { RichTextField } from "@/components/authoring";
import { FamilyBranchSelect } from "@/components/family-branch-select";
import { GenerationSelect } from "@/components/generation-select";
import { GENERATION_HINT } from "@/lib/generations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SalonPanel, PanelEyebrow } from "@/components/shell";
import { completeOnboarding, skipOnboarding } from "./actions";
import type { WelcomeFormState } from "./actions";

const initialState: WelcomeFormState = { status: "idle" };

/**
 * Guided first-run experience (PRD 13, slice 1). One warm Family-mode card:
 * who you are (name + family, required) → a photo (optional, saves on its own)
 * → a line about yourself (optional). Finishing stamps onboarded_at and drops
 * you on the dashboard; "Finish later" lets you in without trapping you.
 *
 * The photo step is a server-rendered slot (it fetches + signs URLs); we just
 * place it in the flow.
 */
export function WelcomeFlow({
  greetingName,
  defaultFullName,
  defaultFamilyBranch,
  defaultGeneration,
  defaultPhone,
  defaultRelationshipNotes,
  defaultBio,
  photoSlot,
}: {
  greetingName: string;
  defaultFullName: string | null;
  defaultFamilyBranch: string | null;
  defaultGeneration: number | null;
  defaultPhone: string | null;
  defaultRelationshipNotes: string | null;
  defaultBio: string | null;
  photoSlot: React.ReactNode;
}) {
  const [state, formAction, isPending] = useActionState(
    completeOnboarding,
    initialState,
  );

  return (
    <SalonPanel className="border-accent-family/25">
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <PanelEyebrow className="text-accent-family">
            Welcome, {greetingName}
          </PanelEyebrow>
          <h1 className="font-display text-[1.875rem] leading-[1.08] text-foreground sm:text-[2.25rem]">
            Let&apos;s set up your profile.
          </h1>
          <p className="max-w-prose text-sm leading-relaxed text-foreground-muted">
            This is the family&apos;s private site, a place to keep up with
            each other and our shared homes. A few quick details and
            you&apos;re in. You can change any of it later.
          </p>
        </header>

        <form action={formAction} className="flex flex-col gap-6">
          <Field
            label="Your name"
            htmlFor="full_name"
            hint="How you'd like to appear in the family directory."
          >
            <Input
              id="full_name"
              name="full_name"
              defaultValue={defaultFullName ?? ""}
              autoComplete="name"
              placeholder="e.g., Jane Mathieson"
              required
            />
          </Field>

          <Field
            label="Your family"
            htmlFor="family_branch"
            hint="Which of the three sibling families you belong to."
          >
            <FamilyBranchSelect
              defaultValue={defaultFamilyBranch}
              required
            />
          </Field>

          <Field
            label="Your generation"
            htmlFor="generation"
            hint={GENERATION_HINT}
          >
            <GenerationSelect defaultValue={defaultGeneration} required />
          </Field>

          <Field
            label="Phone"
            htmlFor="phone"
            hint="Optional: so the family can reach you."
          >
            <Input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              defaultValue={defaultPhone ?? ""}
              placeholder="e.g., (555) 123-4567"
            />
          </Field>

          <Field
            label="Relationship notes"
            htmlFor="relationship_notes"
            hint='Optional: e.g., "spouse of Sarah", "son of Peter & Mary".'
          >
            <Input
              id="relationship_notes"
              name="relationship_notes"
              defaultValue={defaultRelationshipNotes ?? ""}
            />
          </Field>

          <Field
            label="A little about you"
            htmlFor="bio"
            hint="Optional: a sentence or two the family would enjoy."
          >
            <RichTextField
              id="bio"
              name="bio"
              tone="salon"
              rows={3}
              defaultValue={defaultBio}
            />
          </Field>

          {state.status === "error" && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}

          <div className="flex flex-wrap items-center gap-4 border-t border-border pt-5">
            <Button
              type="submit"
              disabled={isPending}
              className="bg-accent-family text-accent-family-foreground hover:bg-accent-family/90"
            >
              {isPending ? "Setting up…" : "Enter the Site"}
            </Button>
            {/* Separate form — "finish later" carries no fields and can't nest. */}
            <SkipButton />
          </div>
        </form>

        <section className="flex flex-col gap-3 border-t border-border pt-6">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-foreground">
              Add a photo{" "}
              <span className="text-foreground-subtle">(optional)</span>
            </p>
            <p className="text-xs text-foreground-subtle">
              Saves on its own. You don&apos;t need to press Enter for this.
            </p>
          </div>
          {photoSlot}
        </section>
      </div>
    </SalonPanel>
  );
}

function SkipButton() {
  return (
    <form action={skipOnboarding}>
      <Button
        type="submit"
        variant="ghost"
        className="text-foreground-muted hover:text-foreground"
      >
        Finish Later
      </Button>
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
