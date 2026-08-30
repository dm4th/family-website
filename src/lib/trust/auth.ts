// Trust-vault viewer resolution (PRD 40). SERVER ONLY.
//
// Same posture as resolveViewer/canManageProperty: the DB is the guarantee
// (RLS on every trust table checks is_trust_manager() / the grant rows), and
// these helpers exist so pages and actions ask the same question the same way
// for UX and early, well-worded rejections.

import { createClient } from "@/lib/supabase/server";
import { resolveViewer, type Viewer } from "@/lib/guest";

export type TrustViewer = Viewer & {
  /** Seated in trust_managers — uploads, grants, deletes, approvals. */
  isTrustManager: boolean;
};

/**
 * Resolve the signed-in viewer plus their trust-manager standing. Uses the
 * is_trust_manager() SQL function the policies use, so the UI can never
 * disagree with what RLS enforces.
 */
export async function resolveTrustViewer(): Promise<TrustViewer | null> {
  const viewer = await resolveViewer();
  if (!viewer) return null;

  const supabase = await createClient();
  const { data } = await supabase.rpc("is_trust_manager");
  return { ...viewer, isTrustManager: data === true };
}

/**
 * Whether this viewer can see anything in the vault at all: a manager, or the
 * holder of at least one document grant. Drives nav-level affordances and the
 * page's empty-state copy; RLS does the real filtering either way.
 */
export async function hasTrustStanding(viewer: TrustViewer): Promise<boolean> {
  if (viewer.isTrustManager) return true;
  const supabase = await createClient();
  const { count } = await supabase
    .from("trust_document_access")
    .select("document_id", { count: "exact", head: true });
  return (count ?? 0) > 0;
}
