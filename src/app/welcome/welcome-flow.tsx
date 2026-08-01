"use client";

import * as React from "react";
import { useActionState } from "react";

import { RichTextField } from "@/components/authoring";
import { FamilyBranchSelect } from "@/components/family-branch-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormStatus } from "@/components/form-status";
import { SalonPanel, PanelEyebrow } from "@/components/shell";
import { TreeStep, type TreeStepData } from "./tree-step";
import {
  finishOnboarding,
  saveIdentity,
  savePlacement,
  skipOnboarding,
} from "./actions";
import type { WelcomeFormState } from "./actions";

const initialState: WelcomeFormState = { status: "idle" };

const STEPS = [
  { title: "Who you are" },
  { title: "Your place in the family" },
  { title: "A face and a few words" },
] as const;

/**
 * Guided first-run experience (PRD 13, restructured by PRD 39).
 *
 * Three short steps instead of one six-field card. The old form put its primary
 * button below the fold on an iPad and saved nothing until every required field
 * was filled, so an interrupted first run left no trace — which is exactly how
 * we ended up with a member who signed in once and stayed nameless for weeks.
 * Each step now saves on its own, and "Finish Later" is offered on all three.
 *
 * The middle step is the point of PRD 39: finishing it writes real `people` and
 * `relationships` rows, so the tree grows by a node and its edges every time
 * somebody joins.
 */
export function WelcomeFlow({
  greetingName,
  initialStep = 0,
  alreadyPlaced = false,
  defaultFullName,
  defaultFamilyBranch,
  defaultPhone,
  defaultBio,
  treeData,
  photoSlot,
}: {
  greetingName: string;
  /** Resume point for someone coming back to finish (PRD 39). */
  initialStep?: number;
  /** True when they already have a linked person row — the tree step becomes optional extras. */
  alreadyPlaced?: boolean;
  defaultFullName: string | null;
  defaultFamilyBranch: string | null;
  defaultPhone: string | null;
  defaultBio: string | null;
  treeData: TreeStepData;
  photoSlot: React.ReactNode;
}) {
  const [step, setStep] = React.useState(initialStep);

  return (
    <SalonPanel className="border-accent-family/25">
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <PanelEyebrow className="text-accent-family">
            Welcome, {greetingName}
          </PanelEyebrow>
          <h1 className="font-display text-[1.875rem] leading-[1.08] text-foreground sm:text-[2.25rem]">
            {STEPS[step]!.title}
          </h1>
          <p className="text-sm text-foreground-subtle">
            Step {step + 1} of {STEPS.length}
          </p>
        </header>

        {step === 0 && (
          <IdentityStep
            defaultFullName={defaultFullName}
            defaultFamilyBranch={defaultFamilyBranch}
            defaultPhone={defaultPhone}
            onDone={() => setStep(1)}
          />
        )}

        {step === 1 && (
          <PlacementStep
            treeData={treeData}
            alreadyPlaced={alreadyPlaced}
            onDone={() => setStep(2)}
            onBack={() => setStep(0)}
          />
        )}

        {step === 2 && (
          <FinalStep
            defaultBio={defaultBio}
            photoSlot={photoSlot}
            onBack={() => setStep(1)}
          />
        )}
      </div>
    </SalonPanel>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — who you are.
// ---------------------------------------------------------------------------
function IdentityStep({
  defaultFullName,
  defaultFamilyBranch,
  defaultPhone,
  onDone,
}: {
  defaultFullName: string | null;
  defaultFamilyBranch: string | null;
  defaultPhone: string | null;
  onDone: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    saveIdentity,
    initialState,
  );
  useAdvanceOnSave(state, onDone);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <p className="max-w-prose text-sm leading-relaxed text-foreground-muted">
        This is the family&apos;s private site, a place to keep up with each
        other and our shared homes. You can change any of this later.
      </p>

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
        <FamilyBranchSelect defaultValue={defaultFamilyBranch} required />
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

      <StepFooter
        isPending={isPending}
        state={state}
        submitLabel="Continue"
        pendingLabel="Saving…"
      />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — your place in the family.
// ---------------------------------------------------------------------------
function PlacementStep({
  treeData,
  alreadyPlaced,
  onDone,
  onBack,
}: {
  treeData: TreeStepData;
  alreadyPlaced: boolean;
  onDone: () => void;
  onBack: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    savePlacement,
    initialState,
  );
  useAdvanceOnSave(state, onDone);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <p className="max-w-prose text-sm leading-relaxed text-foreground-muted">
        {alreadyPlaced
          ? "You're already in the family tree. Add anyone we're still missing, or just continue. Nothing is saved until you press Continue."
          : "Two questions, and you'll show up in the family tree connected to the people you belong with. Nothing is saved until you press Continue."}
      </p>

      <TreeStep data={treeData} />

      <StepFooter
        isPending={isPending}
        state={state}
        submitLabel="Continue"
        pendingLabel="Adding you to the tree…"
        onBack={onBack}
      />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — a face and a few words.
// ---------------------------------------------------------------------------
function FinalStep({
  defaultBio,
  photoSlot,
  onBack,
}: {
  defaultBio: string | null;
  photoSlot: React.ReactNode;
  onBack: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    finishOnboarding,
    initialState,
  );

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">
            Add a photo <span className="text-foreground-subtle">(optional)</span>
          </p>
          <p className="text-sm text-foreground-subtle">
            Saves on its own. You don&apos;t need to press Finish for this.
          </p>
        </div>
        {photoSlot}
      </section>

      <form action={formAction} className="flex flex-col gap-6">
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

        <StepFooter
          isPending={isPending}
          state={state}
          submitLabel="Finish"
          pendingLabel="Finishing…"
          onBack={onBack}
        />
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

/** Advance once the step's action reports a clean save. */
function useAdvanceOnSave(state: WelcomeFormState, onDone: () => void) {
  const done = React.useRef(onDone);
  React.useEffect(() => {
    done.current = onDone;
  });
  React.useEffect(() => {
    if (state.status === "saved") done.current();
  }, [state]);
}

function StepFooter({
  isPending,
  state,
  submitLabel,
  pendingLabel,
  onBack,
}: {
  isPending: boolean;
  state: WelcomeFormState;
  submitLabel: string;
  pendingLabel: string;
  onBack?: () => void;
}) {
  return (
    <>
      <FormStatus tone="error">
        {state.status === "error" ? state.message : null}
      </FormStatus>

      <div className="flex flex-wrap items-center gap-4 border-t border-border pt-5">
        <Button
          type="submit"
          disabled={isPending}
          className="bg-accent-family text-accent-family-foreground hover:bg-accent-family/90"
        >
          {isPending ? pendingLabel : submitLabel}
        </Button>
        {onBack && (
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            className="text-foreground-muted hover:text-foreground"
          >
            Back
          </Button>
        )}
        {/* "Finish Later" overrides this form's action rather than living in a
            form of its own: a nested <form> is dropped by the HTML parser, which
            would silently turn this into a submit button for the step itself.
            formNoValidate so leaving on step 1 isn't blocked by the required
            fields the member is choosing not to fill in yet. */}
        <Button
          type="submit"
          formAction={skipOnboarding}
          formNoValidate
          variant="ghost"
          className="text-foreground-muted hover:text-foreground"
        >
          Finish Later
        </Button>
      </div>
    </>
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
      {hint ? <p className="text-sm text-foreground-subtle">{hint}</p> : null}
    </div>
  );
}
