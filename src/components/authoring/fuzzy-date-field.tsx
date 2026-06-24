"use client";

import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The value a FuzzyDateField submits / accepts.
 *
 *   { precision: "exact", date: "1968-07-04" }   ← a real calendar day
 *   { precision: "circa", text: "summer 1972" }  ← an era / approximate phrase
 *   { precision: "none" }                         ← unset
 *
 * It is serialized to JSON in a single hidden <input>, so a Server Action
 * reads it with `JSON.parse(formData.get(name))`. Legacy (PRD 11) is the
 * intended first consumer — photos and events frequently have no exact date,
 * so an "era" phrase has to be a first-class option, not a workaround.
 */
export type FuzzyDate =
  | { precision: "exact"; date: string }
  | { precision: "circa"; text: string }
  | { precision: "none" };

/**
 * FuzzyDateField — pick a precise calendar date OR describe an approximate one
 * ("circa 1968", "summer 1972") for material that predates anyone's memory of
 * the exact day (PRD 12, slice 2).
 *
 * No shipped form consumes this yet; it's part of the authoring layer staged
 * for Legacy. Kept dependency-free (native date input) per the PRD.
 */
export function FuzzyDateField({
  name,
  defaultValue = { precision: "none" },
  id: idProp,
  exactLabel = "Exact date",
  circaLabel = "Approximate",
  circaPlaceholder = "e.g., circa 1968, summer 1972",
}: {
  name: string;
  defaultValue?: FuzzyDate;
  id?: string;
  exactLabel?: string;
  circaLabel?: string;
  circaPlaceholder?: string;
}) {
  const reactId = useId();
  const fieldId = idProp ?? `fuzzy-${reactId}`;

  // "none" defaults to the exact-date mode in the UI (most common for new,
  // modern content) but submits as "none" until the user actually enters one.
  const [mode, setMode] = useState<"exact" | "circa">(
    defaultValue.precision === "circa" ? "circa" : "exact",
  );
  const [exact, setExact] = useState(
    defaultValue.precision === "exact" ? defaultValue.date : "",
  );
  const [circa, setCirca] = useState(
    defaultValue.precision === "circa" ? defaultValue.text : "",
  );

  // Derive the serialized value from current state.
  let value: FuzzyDate;
  if (mode === "exact") {
    value = exact ? { precision: "exact", date: exact } : { precision: "none" };
  } else {
    value = circa.trim()
      ? { precision: "circa", text: circa.trim() }
      : { precision: "none" };
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={JSON.stringify(value)} />

      {/* Mode toggle */}
      <div
        className="inline-flex w-fit rounded-md border border-border p-0.5 text-sm"
        role="radiogroup"
        aria-label="Date precision"
      >
        <ModeButton
          selected={mode === "exact"}
          onClick={() => setMode("exact")}
        >
          {exactLabel}
        </ModeButton>
        <ModeButton
          selected={mode === "circa"}
          onClick={() => setMode("circa")}
        >
          {circaLabel}
        </ModeButton>
      </div>

      {mode === "exact" ? (
        <Input
          id={fieldId}
          type="date"
          value={exact}
          onChange={(e) => setExact(e.target.value)}
          className="max-w-[12rem]"
        />
      ) : (
        <Input
          id={fieldId}
          type="text"
          value={circa}
          placeholder={circaPlaceholder}
          onChange={(e) => setCirca(e.target.value)}
          className="max-w-[20rem]"
        />
      )}
    </div>
  );
}

function ModeButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "rounded px-2.5 py-1 font-medium transition-colors",
        selected
          ? "bg-surface text-foreground"
          : "text-foreground-subtle hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
