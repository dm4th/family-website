"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { recordRevision } from "@/lib/revisions";
import type { SaveState } from "@/components/authoring/save-state";

// ----------------------------------------------------------------------------
// Form helpers (mirrors family/archive/actions.ts conventions).
// ----------------------------------------------------------------------------
function readText(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

type FuzzyDate =
  | { precision: "exact"; date: string }
  | { precision: "circa"; text: string }
  | { precision: "none" };

/** Parse a {@link FuzzyDateField} JSON value into an exact date OR a circa phrase. */
function parseFuzzyDate(raw: string | null): { date: string | null; circa: string | null } {
  if (!raw) return { date: null, circa: null };
  let parsed: FuzzyDate;
  try {
    parsed = JSON.parse(raw) as FuzzyDate;
  } catch {
    return { date: null, circa: null };
  }
  if (parsed?.precision === "exact" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) {
    return { date: parsed.date, circa: null };
  }
  if (parsed?.precision === "circa" && parsed.text.trim()) {
    return { date: null, circa: parsed.text.trim() };
  }
  return { date: null, circa: null };
}

/** The `people` column set a create/edit form writes. */
type PersonFields = {
  display_name: string;
  given_name: string | null;
  family_name: string | null;
  birth_date: string | null;
  birth_circa: string | null;
  death_date: string | null;
  death_circa: string | null;
  family_branch: string | null;
  bio: string | null;
};

/** Read the shared person fields from a form. Returns null if the (required)
 * display name is missing. */
function readPersonFields(formData: FormData): PersonFields | null {
  const display_name = readText(formData, "display_name");
  if (!display_name) return null;
  const birth = parseFuzzyDate(readText(formData, "birth"));
  const death = parseFuzzyDate(readText(formData, "death"));
  return {
    display_name,
    given_name: readText(formData, "given_name"),
    family_name: readText(formData, "family_name"),
    birth_date: birth.date,
    birth_circa: birth.circa,
    death_date: death.date,
    death_circa: death.circa,
    family_branch: readText(formData, "family_branch"),
    bio: readText(formData, "bio"),
  };
}

// ----------------------------------------------------------------------------
// People — wiki-style create/edit. `people` has open RLS with NO audit trigger,
// so attribution is enforced HERE: every write sets created_by/updated_by, bumps
// updated_at, and records a revision (the primary reviewer check on this slice).
// ----------------------------------------------------------------------------

/** Insert a `people` row from form fields. Shared by createPerson and the
 * inline "create a new relative" path in addRelative. Returns the new id. */
async function insertPerson(
  fields: PersonFields,
  userId: string,
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .insert({ ...fields, created_by: userId, updated_by: userId })
    .select("id")
    .single();
  if (error || !data) {
    return { error: error?.message ?? "Could not add this person." };
  }
  await recordRevision({
    entityType: "person",
    entityId: data.id,
    changedBy: userId,
    before: {},
    after: { ...fields },
  });
  return { id: data.id };
}

export async function createPerson(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { status: "error", message: "Not signed in" };

  const fields = readPersonFields(formData);
  if (!fields) return { status: "error", message: "A name is required." };

  const result = await insertPerson(fields, user.id);
  if ("error" in result) return { status: "error", message: result.error };

  revalidatePath("/family/tree");
  return { status: "saved" };
}

export async function updatePerson(
  personId: string,
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { status: "error", message: "Not signed in" };

  const { data: current, error: currentErr } = await supabase
    .from("people")
    .select(
      "display_name, given_name, family_name, birth_date, birth_circa, death_date, death_circa, family_branch, bio",
    )
    .eq("id", personId)
    .single();
  if (currentErr || !current) return { status: "error", message: "Person not found" };

  const fields = readPersonFields(formData);
  if (!fields) return { status: "error", message: "A name is required." };

  const { error: updateErr } = await supabase
    .from("people")
    .update({ ...fields, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", personId);
  if (updateErr) return { status: "error", message: updateErr.message };

  await recordRevision({
    entityType: "person",
    entityId: personId,
    changedBy: user.id,
    before: { ...(current as PersonFields) },
    after: { ...fields },
  });

  revalidatePath(`/family/tree/${personId}`);
  revalidatePath("/family/tree");
  return { status: "saved" };
}

// ----------------------------------------------------------------------------
// Relationships — add a parent / child / spouse from a person's page. The other
// end is either an existing person (PeoplePicker → hidden `person` input) or a
// brand-new one created inline (the person fields). Adding an ancestor here
// creates NO account — it's a pure `people` row.
// ----------------------------------------------------------------------------
export type RelativeRelation = "parent" | "child" | "spouse";

export async function addRelative(
  focusPersonId: string,
  relation: RelativeRelation,
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { status: "error", message: "Not signed in" };

  // Resolve the other end: an existing person id, or a new one from the fields.
  let otherId = readText(formData, "person");
  if (!otherId) {
    const fields = readPersonFields(formData);
    if (!fields) {
      return { status: "error", message: "Pick someone or enter a name." };
    }
    const created = await insertPerson(fields, user.id);
    if ("error" in created) return { status: "error", message: created.error };
    otherId = created.id;
  }

  if (otherId === focusPersonId) {
    return { status: "error", message: "A person can't be their own relative." };
  }

  // Map the human relation onto a canonical edge row.
  let personA: string;
  let personB: string;
  let type: "parent" | "spouse";
  if (relation === "parent") {
    // the other person is a parent OF the focus person
    [personA, personB, type] = [otherId, focusPersonId, "parent"];
  } else if (relation === "child") {
    // the focus person is a parent OF the other person
    [personA, personB, type] = [focusPersonId, otherId, "parent"];
  } else {
    // spouse — undirected, stored canonically (person_a < person_b)
    const [lo, hi] = [focusPersonId, otherId].sort();
    [personA, personB, type] = [lo!, hi!, "spouse"];
  }

  const { data: edge, error } = await supabase
    .from("relationships")
    .insert({ person_a: personA, person_b: personB, type, created_by: user.id, updated_by: user.id })
    .select("id")
    .single();

  if (error || !edge) {
    // 23505 = unique_violation — the edge already exists. Treat as a no-op
    // success rather than a hard error (someone may have added it already).
    if ((error as { code?: string } | null)?.code === "23505") {
      revalidatePath(`/family/tree/${focusPersonId}`);
      return { status: "saved" };
    }
    return { status: "error", message: error?.message ?? "Could not save this connection." };
  }

  await recordRevision({
    entityType: "relationship",
    entityId: edge.id,
    changedBy: user.id,
    before: {},
    after: { person_a: personA, person_b: personB, type },
  });

  revalidatePath(`/family/tree/${focusPersonId}`);
  revalidatePath(`/family/tree/${otherId}`);
  revalidatePath("/family/tree");
  return { status: "saved" };
}

// ----------------------------------------------------------------------------
// Remove a connection. RLS restricts DELETE to site admins (an edge removal
// rewrites the tree for everyone), so the UI only offers this to admins.
// ----------------------------------------------------------------------------
export type ActionResult = { ok: true } | { ok: false; message: string };

export async function removeRelationship(
  relationshipId: string,
  focusPersonId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, message: "Not signed in" };

  const { error } = await supabase
    .from("relationships")
    .delete()
    .eq("id", relationshipId);
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/family/tree/${focusPersonId}`);
  revalidatePath("/family/tree");
  return { ok: true };
}
