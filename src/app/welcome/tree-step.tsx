"use client";

import * as React from "react";
import { PlusIcon, XIcon } from "lucide-react";

import { PeoplePicker, type SelectedPerson } from "@/components/authoring";
import { GenerationSelect } from "@/components/generation-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generationAnchor, GENERATION_HINT } from "@/lib/generations";
import { suggestGeneration, type TreeEdge } from "@/lib/family-tree";
import type { ClaimCandidate } from "./actions";

/** Someone the invitation hint says is probably a relative. */
export type PersonSuggestion = { id: string; displayName: string };

/** Everything already selected, plus one more, without duplicating them. */
function unionBy(
  selected: SelectedPerson[],
  addition: PersonSuggestion,
): SelectedPerson[] {
  return selected.some((p) => p.id === addition.id)
    ? selected
    : [...selected, addition];
}

export type TreeStepData = {
  /** Every parent/spouse edge in the tree — small enough to ship whole. */
  edges: TreeEdge[];
  /** person id → recorded generation, for people we can already place. */
  knownGenerations: [string, number][];
  /** People the inviter's kinship answer implies, with the sentence explaining why. */
  suggestedParents: PersonSuggestion[];
  suggestedSpouse: PersonSuggestion | null;
  suggestionReason: string | null;
  /** Unlinked rows matching the member's name — offered, never auto-claimed. */
  claimCandidates: ClaimCandidate[];
  defaultGeneration: number | null;
};

/**
 * Step 2 — "Your place in the family" (PRD 39, slice B).
 *
 * Two questions, because parents and spouse are the two edges that actually
 * place a person; children arrive when the children themselves onboard. Every
 * answer is optional in the sense that you can leave a picker empty, but
 * generation is required, and pressing Save is the only thing that writes.
 */
export function TreeStep({ data }: { data: TreeStepData }) {
  const known = React.useMemo(
    () => new Map(data.knownGenerations),
    [data.knownGenerations],
  );

  // The picker's live selection, kept here so applying a suggestion can re-seed
  // it with the UNION of what's already chosen. Seeding with the suggestion
  // alone would silently drop a parent the member had just picked by hand.
  const [parentSelection, setParentSelection] = React.useState<SelectedPerson[]>(
    [],
  );
  const [spouseSelection, setSpouseSelection] = React.useState<SelectedPerson[]>(
    [],
  );
  const parentIds = React.useMemo(
    () => parentSelection.map((p) => p.id),
    [parentSelection],
  );
  const [parentStubs, setParentStubs] = React.useState<string[]>([]);
  const [spouseStub, setSpouseStub] = React.useState<string | null>(null);
  const [claimId, setClaimId] = React.useState<string | null>(null);
  const [claimDecided, setClaimDecided] = React.useState(false);

  // Suggestions the member hasn't acted on yet.
  const [openParentSuggestions, setOpenParentSuggestions] = React.useState(
    data.suggestedParents,
  );
  const [openSpouseSuggestion, setOpenSpouseSuggestion] = React.useState(
    data.suggestedSpouse,
  );
  // Applying a suggestion re-seeds the picker (via its key) with everything
  // selected so far plus the suggested person.
  const [seededParents, setSeededParents] = React.useState<SelectedPerson[]>([]);
  const [seededSpouse, setSeededSpouse] = React.useState<SelectedPerson[]>([]);

  const suggested = suggestGeneration(parentIds, data.edges, known);

  // The generation field follows the suggestion until the member edits it, and
  // an existing saved value always outranks a guess.
  const [generationTouched, setGenerationTouched] = React.useState(
    data.defaultGeneration != null,
  );
  const [generationChoice, setGenerationChoice] = React.useState(
    data.defaultGeneration != null ? String(data.defaultGeneration) : "",
  );
  const showingSuggestion = !generationTouched && suggested != null;
  const generationValue = showingSuggestion
    ? String(suggested)
    : generationChoice;

  return (
    <div className="flex flex-col gap-7">
      {/* ---- Claim: are you already in the tree? ------------------------ */}
      {data.claimCandidates.length > 0 && !claimDecided && (
        <ClaimCard
          candidates={data.claimCandidates}
          onClaim={(id) => {
            setClaimId(id);
            setClaimDecided(true);
          }}
          onDecline={() => {
            setClaimId(null);
            setClaimDecided(true);
          }}
        />
      )}
      {claimId && (
        <input type="hidden" name="claim_person_id" value={claimId} />
      )}
      {claimDecided && (
        <p className="rounded-md border border-border bg-surface/60 px-4 py-3 text-sm text-foreground-muted">
          {claimId
            ? "Good. We'll connect you to the person already in the tree."
            : "Good. We'll add you to the tree as a new entry."}{" "}
          <button
            type="button"
            onClick={() => setClaimDecided(false)}
            className="font-medium text-accent-family underline-offset-4 hover:underline"
          >
            Change this
          </button>
        </p>
      )}

      {/* ---- Parents ---------------------------------------------------- */}
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-foreground">
          Who are your parents?
        </legend>
        <p className="text-sm text-foreground-subtle">
          Start typing a name. Most people add two. If a parent isn&apos;t in
          the family site yet, you can still add their name.
        </p>

        {openParentSuggestions.map((s) => (
          <SuggestionRow
            key={s.id}
            label={`Add ${s.displayName} as your parent?`}
            reason={data.suggestionReason}
            onAdd={() => {
              setSeededParents(unionBy(parentSelection, s));
              setOpenParentSuggestions((prev) =>
                prev.filter((p) => p.id !== s.id),
              );
            }}
            onDismiss={() =>
              setOpenParentSuggestions((prev) =>
                prev.filter((p) => p.id !== s.id),
              )
            }
          />
        ))}

        <PeoplePicker
          key={`parents-${seededParents.map((p) => p.id).join(",")}`}
          name="parent_person"
          defaultSelected={seededParents}
          placeholder="Search for a parent…"
          inputAriaLabel="Search for a parent by name"
          onSelectionChange={setParentSelection}
        />

        <StubList
          items={parentStubs}
          onChange={setParentStubs}
          inputName="parent_name"
          addLabel="A parent isn't listed"
          placeholder="Their name"
          fieldLabel="Parent's name"
        />
      </fieldset>

      {/* ---- Spouse ----------------------------------------------------- */}
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-foreground">
          Are you married? To whom?
        </legend>
        <p className="text-sm text-foreground-subtle">
          Leave this empty if it doesn&apos;t apply.
        </p>

        {/* Only one spouse is accepted, so the offer disappears once they've
            chosen someone rather than sitting there ready to replace them. */}
        {openSpouseSuggestion && spouseSelection.length === 0 && (
          <SuggestionRow
            label={`Add ${openSpouseSuggestion.displayName} as your spouse?`}
            reason={data.suggestionReason}
            onAdd={() => {
              setSeededSpouse([openSpouseSuggestion]);
              setOpenSpouseSuggestion(null);
            }}
            onDismiss={() => setOpenSpouseSuggestion(null)}
          />
        )}

        <PeoplePicker
          key={`spouse-${seededSpouse.map((p) => p.id).join(",")}`}
          name="spouse_person"
          defaultSelected={seededSpouse}
          max={1}
          placeholder="Search for your spouse…"
          inputAriaLabel="Search for your spouse by name"
          onSelectionChange={setSpouseSelection}
        />

        <StubList
          items={spouseStub == null ? [] : [spouseStub]}
          onChange={(next) => setSpouseStub(next[0] ?? null)}
          inputName="spouse_name"
          addLabel="They aren't listed"
          placeholder="Their name"
          fieldLabel="Spouse's name"
          max={1}
        />
      </fieldset>

      {/* ---- Generation, suggested from the tree ------------------------ */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="generation" className="text-foreground-muted">
          Your generation
        </Label>
        <GenerationSelect
          value={generationValue}
          onChange={(v) => {
            // From here on this is the member's answer, not ours. Picking a
            // different parent must never quietly overwrite it.
            setGenerationTouched(true);
            setGenerationChoice(v);
          }}
          required
        />
        <p className="text-sm text-foreground-subtle">
          {showingSuggestion ? (
            <>
              Suggested from where you sit in the tree
              {generationAnchor(suggested!)
                ? `: ${generationAnchor(suggested!)!.toLowerCase()}`
                : ""}
              . Change it if we got it wrong.
            </>
          ) : (
            GENERATION_HINT
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * The claim card. Shown only when an unlinked person shares the member's name.
 * The lifespan line is what makes it decidable — there are two Drew Mathiesons
 * in this family, so a name alone is not enough to answer "is this you?".
 */
function ClaimCard({
  candidates,
  onClaim,
  onDecline,
}: {
  candidates: ClaimCandidate[];
  onClaim: (id: string) => void;
  onDecline: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-accent-family/30 bg-accent-family-soft/30 p-4">
      <p className="text-sm text-foreground">
        {candidates.length === 1
          ? "Someone with your name is already in the family tree. Is this you?"
          : "A few people with your name are already in the family tree. Are you one of them?"}
      </p>
      <ul className="flex flex-col gap-2">
        {candidates.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-foreground">
              {c.displayName}
              {c.lifespan ? (
                <span className="text-foreground-subtle"> · {c.lifespan}</span>
              ) : null}
              {c.familyBranch ? (
                <span className="text-foreground-subtle">
                  {" "}
                  · {c.familyBranch}
                </span>
              ) : null}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onClaim(c.id)}
            >
              Yes, That&apos;s Me
            </Button>
          </li>
        ))}
      </ul>
      <div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-foreground-muted hover:text-foreground"
          onClick={onDecline}
        >
          {candidates.length === 1 ? "No, That's Someone Else" : "None of These"}
        </Button>
      </div>
    </div>
  );
}

/** A one-tap suggestion derived from what the inviter told us. */
function SuggestionRow({
  label,
  reason,
  onAdd,
  onDismiss,
}: {
  label: string;
  reason: string | null;
  onAdd: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-accent-bronze/50 bg-surface/60 px-4 py-3">
      <p className="flex-1 text-sm text-foreground">
        {label}
        {reason ? (
          <span className="block text-foreground-subtle">{reason}</span>
        ) : null}
      </p>
      <Button type="button" size="sm" variant="outline" onClick={onAdd}>
        Add
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-foreground-muted hover:text-foreground"
        onClick={onDismiss}
      >
        No Thanks
      </Button>
    </div>
  );
}

/**
 * "They're not listed" — free-text names that become stub `people` rows on
 * save. Keeps the step unblocked when a parent predates the site, which is the
 * common case for anyone marrying in.
 */
function StubList({
  items,
  onChange,
  inputName,
  addLabel,
  placeholder,
  fieldLabel,
  max = 4,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  inputName: string;
  addLabel: string;
  placeholder: string;
  fieldLabel: string;
  max?: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((value, i) => (
        <div key={i} className="flex items-center gap-2">
          <Label htmlFor={`${inputName}-${i}`} className="sr-only">
            {fieldLabel}
          </Label>
          <Input
            id={`${inputName}-${i}`}
            name={inputName}
            value={value}
            placeholder={placeholder}
            className="max-w-[20rem]"
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${fieldLabel}`}
            className="text-foreground-subtle hover:text-foreground"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <XIcon />
          </Button>
        </div>
      ))}
      {items.length < max && (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-accent-family hover:text-accent-family"
            onClick={() => onChange([...items, ""])}
          >
            <PlusIcon className="size-4" aria-hidden />
            {addLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
