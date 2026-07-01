"use client";

import { useState } from "react";

import { CreateFlow } from "@/components/authoring/create-flow";
import { PeoplePicker } from "@/components/authoring/people-picker";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { addRelative, type RelativeRelation } from "./actions";
import { PersonFields } from "./person-fields";

/**
 * The body of an "add a relative" flow: pick an EXISTING person, or create a
 * brand-new one inline. Only one branch is mounted at a time, so the new-person
 * form's required Name field never blocks the "existing" path.
 */
function RelativeBody() {
  const [mode, setMode] = useState<"existing" | "new">("existing");

  return (
    <div className="flex flex-col gap-4">
      <div
        className="inline-flex w-fit rounded-md border border-border p-0.5 text-sm"
        role="radiogroup"
        aria-label="Add an existing person or a new one"
      >
        {(["existing", "new"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "rounded px-2.5 py-1 font-medium transition-colors",
              mode === m
                ? "bg-surface text-foreground"
                : "text-foreground-subtle hover:text-foreground",
            )}
          >
            {m === "existing" ? "Someone recorded" : "Someone new"}
          </button>
        ))}
      </div>

      {mode === "existing" ? (
        <div className="flex flex-col gap-1.5">
          <Label>Choose a person</Label>
          <PeoplePicker
            name="person"
            placeholder="Search family & ancestors…"
            emptyHint="No one chosen yet."
          />
          <p className="text-xs text-foreground-subtle">
            Add one relative at a time.
          </p>
        </div>
      ) : (
        <PersonFields />
      )}
    </div>
  );
}

const COPY: Record<RelativeRelation, { trigger: string; title: string; description: string }> = {
  parent: {
    trigger: "Add a Parent",
    title: "Add a parent",
    description: "Connect a mother or father above this person.",
  },
  child: {
    trigger: "Add a Child",
    title: "Add a child",
    description: "Connect a son or daughter below this person.",
  },
  spouse: {
    trigger: "Add a Spouse",
    title: "Add a spouse",
    description: "Connect a husband, wife, or partner beside this person.",
  },
};

function RelativeFlow({
  focusPersonId,
  relation,
}: {
  focusPersonId: string;
  relation: RelativeRelation;
}) {
  const copy = COPY[relation];
  const action = addRelative.bind(null, focusPersonId, relation);
  return (
    <CreateFlow
      triggerLabel={copy.trigger}
      title={copy.title}
      description={copy.description}
      action={action}
      submitLabel="Add"
    >
      <RelativeBody />
    </CreateFlow>
  );
}

/**
 * AddRelative — the edge-authoring controls on a person's page. Each button
 * opens a sheet to attach a parent / child / spouse, picking an existing person
 * or creating a new one inline. Writes a `relationships` row (PRD 11, slice 2).
 */
export function AddRelative({ focusPersonId }: { focusPersonId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <RelativeFlow focusPersonId={focusPersonId} relation="parent" />
      <RelativeFlow focusPersonId={focusPersonId} relation="child" />
      <RelativeFlow focusPersonId={focusPersonId} relation="spouse" />
    </div>
  );
}
