"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { FAMILY_BRANCHES } from "@/lib/family-branches";

/**
 * Family Branch picker (PRD 13, slice 2). A native <select> so it's keyboard-
 * and touch-friendly on an iPad with zero extra JS, styled to match the Input
 * primitive. Used on profile-edit and in the /welcome flow.
 *
 * If the member's stored branch isn't one of the known constants (legacy
 * free-text data), it's surfaced as a selectable option so saving doesn't
 * silently drop it.
 */
export function FamilyBranchSelect({
  id = "family_branch",
  name = "family_branch",
  defaultValue,
  required,
  className,
}: {
  id?: string;
  name?: string;
  defaultValue?: string | null;
  required?: boolean;
  className?: string;
}) {
  const current = defaultValue?.trim() || "";
  const isKnown = (FAMILY_BRANCHES as readonly string[]).includes(current);

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
      <option value="">Select your family…</option>
      {FAMILY_BRANCHES.map((branch) => (
        <option key={branch} value={branch}>
          {branch}
        </option>
      ))}
      {current && !isKnown && (
        <option value={current}>{current}</option>
      )}
    </select>
  );
}
