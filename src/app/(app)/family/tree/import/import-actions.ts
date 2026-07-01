"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { recordRevision } from "@/lib/revisions";
import {
  isValidIsoDate,
  normalizeName,
  type ImportedPersonFields,
} from "@/lib/legacy-import";

export type CommitImportResult =
  | {
      ok: true;
      created: number;
      skippedDuplicate: number;
      failed: number;
      /** Per-row failure messages, if any (kept short for the summary). */
      errors: string[];
    }
  | { ok: false; message: string };

// Fields that are safe to persist: mirror the tree form's `people` column set.
// Re-derived server-side from the client payload so a hand-crafted request
// can't smuggle in extra columns.
function sanitize(row: ImportedPersonFields): ImportedPersonFields | null {
  const display_name = row.display_name?.trim();
  if (!display_name) return null;
  const str = (v: string | null | undefined): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length ? t : null;
  };
  const date = (v: string | null | undefined): string | null => {
    const t = str(v);
    return t && isValidIsoDate(t) ? t : null;
  };
  return {
    display_name,
    given_name: str(row.given_name),
    family_name: str(row.family_name),
    birth_date: date(row.birth_date),
    birth_circa: str(row.birth_circa),
    death_date: date(row.death_date),
    death_circa: str(row.death_circa),
    family_branch: str(row.family_branch),
    bio: str(row.bio),
  };
}

/**
 * Insert the confirmed rows of a bulk people import (PRD 18, slice 1).
 *
 * The attribution guardrail (PRD 11) is enforced here the same way the tree
 * form enforces it, just in a loop: every created `people` row sets
 * created_by/updated_by = the caller and records a "person" revision.
 *
 * Dedup is re-checked against the database (not just the client preview) so a
 * re-run of the same spreadsheet never doubles the family — matching names are
 * skipped, never merged. Rows fail independently: one bad row can't sink the
 * rest of the batch.
 */
export async function commitPeopleImport(
  rows: ImportedPersonFields[],
): Promise<CommitImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, message: "Not signed in" };

  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, message: "Nothing to import." };
  }

  // Authoritative dedup set: every existing display name, lowercased. RLS lets
  // any family member read `people`, so this is the same view they'd get in the
  // tree. We add to it as we insert so duplicates *within* this batch are caught
  // too.
  const { data: existing, error: existingErr } = await supabase
    .from("people")
    .select("display_name");
  if (existingErr) {
    return { ok: false, message: `Could not load existing people: ${existingErr.message}` };
  }
  const seen = new Set<string>(
    (existing ?? []).map((p) => normalizeName(p.display_name as string)),
  );

  let created = 0;
  let skippedDuplicate = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const raw of rows) {
    const fields = sanitize(raw);
    if (!fields) {
      failed++;
      continue;
    }

    const key = normalizeName(fields.display_name);
    if (seen.has(key)) {
      skippedDuplicate++;
      continue;
    }

    const { data, error } = await supabase
      .from("people")
      .insert({ ...fields, created_by: user.id, updated_by: user.id })
      .select("id")
      .single();

    if (error || !data) {
      failed++;
      if (errors.length < 5) {
        errors.push(`${fields.display_name}: ${error?.message ?? "insert failed"}`);
      }
      continue;
    }

    // Same audit record the single-row create writes, so bulk-created ancestors
    // are just as attributable and reversible as hand-entered ones.
    await recordRevision({
      entityType: "person",
      entityId: data.id,
      changedBy: user.id,
      before: {},
      after: { ...fields },
    });

    seen.add(key);
    created++;
  }

  if (created > 0) revalidatePath("/family/tree");

  return { ok: true, created, skippedDuplicate, failed, errors };
}
