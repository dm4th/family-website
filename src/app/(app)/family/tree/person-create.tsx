"use client";

import { CreateFlow } from "@/components/authoring/create-flow";
import { createPerson } from "./actions";
import { PersonFields } from "./person-fields";

/**
 * "Add a Person" entry point on the tree hub. Records anyone in the family —
 * crucially, an ancestor added here gets NO account and NO invite; they're a
 * pure `people` row (PRD 11 requirements-lock #3). Connect them to the rest of
 * the tree from their page once they exist.
 */
export function PersonCreate() {
  return (
    <CreateFlow
      triggerLabel="Add a Person"
      title="Add a person"
      description="Record anyone in the family, living or not. Ancestors don't need an account, an email, or a login."
      action={createPerson}
      submitLabel="Add Person"
    >
      <PersonFields />
    </CreateFlow>
  );
}
