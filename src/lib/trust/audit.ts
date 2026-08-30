// The one write path for the trust audit log (PRD 40). SERVER ONLY.
//
// Every consequential act in the vault — upload, view, grant change, delete,
// roster change — lands here as a trust_document_events row. The table is
// append-only at the SQL level (insert + select policies only), written as the
// acting user through RLS: no service key, and the actor can't be forged
// because the insert policy pins actor_id to auth.uid().

import { createClient } from "@/lib/supabase/server";
import type { TrustEventKind } from "@/lib/db/schema";

/**
 * Record one audit event.
 *
 * Best-effort by design for reads (losing a `viewed` row must not block a
 * legitimate open), but callers on the WRITE paths should treat `false` as a
 * reason to stop: an upload or grant that can't be audited shouldn't proceed
 * silently. The return value is how callers choose.
 */
export async function recordTrustEvent(opts: {
  event: TrustEventKind;
  actorId: string;
  documentId?: string | null;
  detail?: Record<string, unknown>;
}): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("trust_document_events").insert({
    event: opts.event,
    actor_id: opts.actorId,
    document_id: opts.documentId ?? null,
    detail: opts.detail ?? null,
  });
  if (error) {
    // Log the failure, never the detail payload beyond what the caller chose
    // to store — this line can end up in shared server logs.
    console.error(`[trust] could not record ${opts.event} event`, error);
    return false;
  }
  return true;
}
