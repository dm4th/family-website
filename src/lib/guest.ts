// Guest-access viewer helpers (PRD 15).
//
// The DB is the real guarantee (RLS); these helpers drive the UX layer — the
// stripped nav, hidden member-only affordances, and the guest's filtered
// /properties landing. Role here is informational, never a substitute for RLS.

import { createClient } from "@/lib/supabase/server";

export type ViewerRole = "admin" | "member" | "guest";

export type Viewer = {
  userId: string;
  role: ViewerRole;
  isAdmin: boolean;
  isGuest: boolean;
};

/**
 * Resolve the signed-in viewer's role for the current request. Uses the same
 * is_admin() / is_guest() SQL functions the policies use, so "what the UI
 * thinks you are" can never disagree with "what RLS lets you read".
 *
 * Returns null if there is no signed-in user (callers on gated routes can treat
 * that as "redirect to /login", though proxy.ts already does).
 */
export async function resolveViewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // is_admin() excludes deactivated admins; is_guest() is activation-agnostic
  // by design (see the migration's warning). A user is at most one of these.
  const [{ data: adminCheck }, { data: guestCheck }] = await Promise.all([
    supabase.rpc("is_admin"),
    supabase.rpc("is_guest"),
  ]);
  const isAdmin = adminCheck === true;
  const isGuest = guestCheck === true;
  const role: ViewerRole = isAdmin ? "admin" : isGuest ? "guest" : "member";

  return { userId: user.id, role, isAdmin, isGuest };
}

/**
 * The property IDs a guest has been granted. Members/admins aren't scoped, so
 * this is only meaningful for guests; it returns whatever property_guests rows
 * RLS exposes to the caller (a guest sees only their own).
 */
export async function guestGrantedPropertyIds(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("property_guests")
    .select("property_id");
  return (data ?? []).map((r) => r.property_id as string);
}
