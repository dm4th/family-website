import { createClient } from "@/lib/supabase/server";
import { withSignedUrls } from "@/lib/photos";

export type PropertyStatus = "active" | "maintenance" | "inactive";

export type PropertyCard = {
  id: string;
  slug: string;
  name: string;
  location: string | null;
  status: PropertyStatus;
  heroImagePath: string | null;
  heroImageUrl: string | null;
};

/**
 * For each property: prefer the explicit hero_image_path; otherwise fall back
 * to the most-recently-uploaded photo attached to that property. Either way
 * the returned heroImageUrl is signed (or null if the property has no photo).
 */
export async function loadPropertyCards(opts?: {
  includeInactive?: boolean;
}): Promise<PropertyCard[]> {
  const supabase = await createClient();
  let query = supabase
    .from("properties")
    .select("id, slug, name, location, status, hero_image_path")
    .order("name", { ascending: true });
  if (!opts?.includeInactive) {
    query = query.neq("status", "inactive");
  }
  const { data: properties, error } = await query;
  if (error || !properties) return [];

  const propertyIds = properties.map((p) => p.id);
  const fallbacks = new Map<string, string>();

  if (propertyIds.length > 0) {
    const { data: photos } = await supabase
      .from("photos")
      .select("property_id, storage_path, created_at")
      .in("property_id", propertyIds)
      .order("created_at", { ascending: false });
    for (const photo of photos ?? []) {
      if (photo.property_id && !fallbacks.has(photo.property_id)) {
        fallbacks.set(photo.property_id, photo.storage_path);
      }
    }
  }

  const pathsToSign: { id: string; storagePath: string }[] = [];
  for (const p of properties) {
    const path = p.hero_image_path ?? fallbacks.get(p.id) ?? null;
    if (path) pathsToSign.push({ id: p.id, storagePath: path });
  }

  const signed = await withSignedUrls(pathsToSign);
  const signedById = new Map(signed.map((s) => [s.id, s.signedUrl]));

  return properties.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    location: p.location,
    status: p.status as PropertyStatus,
    heroImagePath: p.hero_image_path ?? null,
    heroImageUrl: signedById.get(p.id) ?? null,
  }));
}
