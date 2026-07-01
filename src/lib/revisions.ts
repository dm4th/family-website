import { createClient } from "@/lib/supabase/server";

export type RevisionEntity =
  | "property"
  | "profile"
  | "property_contact"
  | "booking"
  | "album"
  | "photo"
  | "person"
  | "relationship";

type Scalar = string | number | boolean | null | undefined;
type FieldValue = Scalar | Scalar[];

/**
 * Compute a shallow diff between two records. A field appears in the result
 * only if its value changed. Array and primitive equality is done by
 * JSON.stringify — sufficient for our schema (no nested objects).
 */
export function diffRecords<T extends Record<string, FieldValue>>(
  before: T,
  after: T,
): Record<string, { before: FieldValue; after: FieldValue }> {
  const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
  const diff: Record<string, { before: FieldValue; after: FieldValue }> = {};
  for (const key of keys) {
    const b = before[key] as FieldValue;
    const a = after[key] as FieldValue;
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      diff[key] = { before: b, after: a };
    }
  }
  return diff;
}

/**
 * Insert a revisions row if there's anything to record. No-op when the
 * diff is empty. Caller is responsible for the actual UPDATE on the
 * underlying entity.
 */
export async function recordRevision(opts: {
  entityType: RevisionEntity;
  entityId: string;
  changedBy: string;
  before: Record<string, FieldValue>;
  after: Record<string, FieldValue>;
}): Promise<boolean> {
  const diff = diffRecords(opts.before, opts.after);
  if (Object.keys(diff).length === 0) return false;

  const supabase = await createClient();
  const { error } = await supabase.from("revisions").insert({
    entity_type: opts.entityType,
    entity_id: opts.entityId,
    changed_by: opts.changedBy,
    diff,
  });
  if (error) {
    // Audit log is best-effort — we don't want to roll back the underlying
    // update just because revisions write failed. Log and continue.
    console.error("Failed to record revision:", error.message);
    return false;
  }
  return true;
}
