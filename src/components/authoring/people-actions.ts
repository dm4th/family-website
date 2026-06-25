"use server";

import { createClient } from "@/lib/supabase/server";

/** A single typeahead match from {@link searchPeople}. */
export type PersonHit = {
  id: string;
  displayName: string;
  familyBranch: string | null;
  /** Has a site login (a `profiles` row) — i.e. a current member, not an ancestor. */
  isMember: boolean;
  /** Recorded as deceased — lets the picker mark them gently. */
  inMemoriam: boolean;
};

/**
 * Typeahead search over the Family Legacy `people` table for the PeoplePicker
 * (PRD 12, slice 3). RLS already restricts reads to authenticated members, so
 * this is just a name match. The table is small, so ILIKE is plenty.
 *
 * An empty query returns the first slice of people (alphabetical) so the
 * dropdown can show suggestions before the user types.
 */
export async function searchPeople(query: string): Promise<PersonHit[]> {
  const q = query.trim();
  const supabase = await createClient();

  let req = supabase
    .from("people")
    .select("id, display_name, family_branch, profile_id, death_date")
    .order("display_name", { ascending: true })
    .limit(8);

  if (q) {
    // Escape ILIKE wildcards so a literal % or _ in the query stays literal.
    const escaped = q.replace(/[%_]/g, (c) => `\\${c}`);
    req = req.ilike("display_name", `%${escaped}%`);
  }

  const { data, error } = await req;
  if (error || !data) return [];

  return data.map((r) => ({
    id: r.id as string,
    displayName: r.display_name as string,
    familyBranch: (r.family_branch as string | null) ?? null,
    isMember: r.profile_id != null,
    inMemoriam: r.death_date != null,
  }));
}
