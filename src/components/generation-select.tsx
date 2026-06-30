"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { GENERATIONS, generationLabel } from "@/lib/generations";

/**
 * Generation picker (PRD 13, slice 13-R2). A native <select> like
 * FamilyBranchSelect, so it's keyboard- and touch-friendly on an iPad with zero
 * extra JS, styled to match the Input primitive. Used (required) in the
 * /welcome flow and on profile-edit.
 *
 * Reading the family's own generation scheme means a new member can't finish
 * onboarding with no generation, which is what filed them under "Generation not
 * set" in the Directory. A stored value outside the known set (legacy data) is
 * surfaced as a selectable option so saving never silently drops it.
 */
export function GenerationSelect({
  id = "generation",
  name = "generation",
  defaultValue,
  required,
  className,
}: {
  id?: string;
  name?: string;
  defaultValue?: number | string | null;
  required?: boolean;
  className?: string;
}) {
  const current =
    defaultValue === null || defaultValue === undefined
      ? ""
      : String(defaultValue).trim();
  const isKnown = (GENERATIONS as readonly number[])
    .map(String)
    .includes(current);

  return (
    <select
      id={id}
      name={name}
      required={required}
      defaultValue={current}
      className={cn(
        // Mirror the Input primitive, but taller for a comfortable tap target.
        "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        className,
      )}
    >
      <option value="">Select your generation…</option>
      {GENERATIONS.map((g) => (
        <option key={g} value={g}>
          {generationLabel(g)}
        </option>
      ))}
      {current && !isKnown && (
        <option value={current}>{generationLabel(Number(current))}</option>
      )}
    </select>
  );
}
