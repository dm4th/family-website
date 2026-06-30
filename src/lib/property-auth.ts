import { createClient } from "@/lib/supabase/server";

/**
 * "Can the current user act as an admin for this specific property?"
 * True if they are a site-wide admin OR a property admin for this property.
 *
 * Centralized here so every property-management surface (server actions,
 * conditional UI) asks the same question the same way.
 */
export async function canManageProperty(propertyId: string): Promise<{
  ok: boolean;
  isSiteAdmin: boolean;
  isPropertyAdmin: boolean;
}> {
  const supabase = await createClient();
  const { data: siteAdminCheck } = await supabase.rpc("is_admin");
  const isSiteAdmin = siteAdminCheck === true;
  if (isSiteAdmin) {
    return { ok: true, isSiteAdmin: true, isPropertyAdmin: false };
  }
  const { data: propAdminCheck } = await supabase.rpc("is_property_admin", {
    p_property_id: propertyId,
  });
  const isPropertyAdmin = propAdminCheck === true;
  return { ok: isPropertyAdmin, isSiteAdmin: false, isPropertyAdmin };
}

/**
 * "Can the current user READ this specific property?" — the read-side analogue
 * of canManageProperty. True for any member/admin (they see all) and for a
 * guest only if they hold a grant. Backed by the can_view_property() SQL
 * function so the app check and the RLS predicate stay identical. (PRD 15)
 */
export async function canViewProperty(propertyId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("can_view_property", {
    p_property_id: propertyId,
  });
  return data === true;
}
