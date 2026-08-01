"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordRevision } from "@/lib/revisions";
import { canManageProperty } from "@/lib/property-auth";

export type PropertyFormState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; message: string };

type AmenityList = string[];

function parseAmenities(raw: string | null): AmenityList {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 100); // arbitrary cap
}

function readText(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

export type SetHeroPhotoResult = { ok: true } | { ok: false; message: string };

/**
 * Choose which photo is a property's face (PRD 35). Stores the photo's
 * storage_path in `properties.hero_image_path` — the same format the listing
 * cards already read (`src/lib/properties.ts`). Passing `null` clears the
 * choice and returns the property to newest-photo behavior.
 *
 * Authorization is belt-and-braces: `canManageProperty()` here, and the
 * PRD-27 `properties_guard_privileged_columns` trigger behind it (which
 * rejects hero_image_path writes from anyone but a property/site admin).
 */
export async function setHeroPhoto(
  propertyId: string,
  storagePath: string | null,
): Promise<SetHeroPhotoResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, message: "Not signed in" };
  }

  const { ok: canManage } = await canManageProperty(propertyId);
  if (!canManage) {
    return { ok: false, message: "Only property admins can choose the hero photo." };
  }

  const { data: current, error: currentErr } = await supabase
    .from("properties")
    .select("slug, hero_image_path")
    .eq("id", propertyId)
    .single();
  if (currentErr || !current) {
    return { ok: false, message: "Property not found" };
  }

  // Never write an arbitrary storage path into the column — it has to be a
  // photo that actually belongs to this property.
  if (storagePath !== null) {
    const { data: photo } = await supabase
      .from("photos")
      .select("id")
      .eq("property_id", propertyId)
      .eq("storage_path", storagePath)
      .maybeSingle();
    if (!photo) {
      return { ok: false, message: "That photo isn't on this property." };
    }
  }

  const { error: updateErr } = await supabase
    .from("properties")
    .update({ hero_image_path: storagePath, updated_by: user.id })
    .eq("id", propertyId);
  if (updateErr) {
    return { ok: false, message: updateErr.message };
  }

  await recordRevision({
    entityType: "property",
    entityId: propertyId,
    changedBy: user.id,
    before: { hero_image_path: current.hero_image_path ?? null },
    after: { hero_image_path: storagePath },
  });

  revalidatePath(`/properties/${current.slug}`);
  revalidatePath("/properties");
  return { ok: true };
}

export async function updateProperty(
  propertyId: string,
  _prev: PropertyFormState,
  formData: FormData,
): Promise<PropertyFormState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { status: "error", message: "Not signed in" };
  }

  // Pull current state for diffing.
  const { data: current, error: currentErr } = await supabase
    .from("properties")
    .select(
      "slug, name, location, address, description, how_to, guidelines, amenities, wifi_network, wifi_password, status, max_guests, peak_period_ranges",
    )
    .eq("id", propertyId)
    .single();
  if (currentErr || !current) {
    return { status: "error", message: "Property not found" };
  }

  // Status changes are gated to site admins OR property admins for this
  // specific property. Wiki text edits are open to all signed-in members.
  const { ok: canChangeStatus } = await canManageProperty(propertyId);

  const name = readText(formData, "name");
  if (!name) {
    return { status: "error", message: "Name is required." };
  }

  // Booking-config inputs (admin-only).
  let nextMaxGuests: number | null = current.max_guests ?? null;
  let nextPeakRanges: { start: string; end: string }[] =
    (current.peak_period_ranges ?? []) as { start: string; end: string }[];
  if (canChangeStatus) {
    const raw = readText(formData, "max_guests");
    if (raw === null) {
      nextMaxGuests = null;
    } else {
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 1) {
        return { status: "error", message: "Max guests must be a positive number." };
      }
      nextMaxGuests = n;
    }
    const peakRaw = readText(formData, "peak_period_ranges");
    if (peakRaw !== null) {
      try {
        const parsed = JSON.parse(peakRaw);
        if (!Array.isArray(parsed)) throw new Error("not array");
        const valid: { start: string; end: string }[] = [];
        for (const r of parsed) {
          if (
            !r ||
            typeof r.start !== "string" ||
            typeof r.end !== "string" ||
            !/^\d{2}-\d{2}$/.test(r.start) ||
            !/^\d{2}-\d{2}$/.test(r.end)
          ) {
            return {
              status: "error",
              message: "Peak periods must be MM-DD → MM-DD pairs.",
            };
          }
          valid.push({ start: r.start, end: r.end });
        }
        nextPeakRanges = valid;
      } catch {
        return { status: "error", message: "Invalid peak periods." };
      }
    }
  }

  const next = {
    name,
    location: readText(formData, "location"),
    address: readText(formData, "address"),
    description: readText(formData, "description"),
    how_to: readText(formData, "how_to"),
    guidelines: readText(formData, "guidelines"),
    amenities: parseAmenities(readText(formData, "amenities")),
    // Wi-Fi is a wiki field like how_to: any non-guest member may maintain it,
    // and it sits deliberately outside the privileged-column guard (PRD 36).
    wifi_network: readText(formData, "wifi_network"),
    wifi_password: readText(formData, "wifi_password"),
    status: canChangeStatus
      ? (readText(formData, "status") ?? current.status)
      : current.status,
  };

  // Validate status enum if the admin submitted one.
  if (!["active", "maintenance", "inactive"].includes(next.status)) {
    return { status: "error", message: "Invalid status value." };
  }

  const { error: updateErr } = await supabase
    .from("properties")
    .update({
      name: next.name,
      location: next.location,
      address: next.address,
      description: next.description,
      how_to: next.how_to,
      guidelines: next.guidelines,
      amenities: next.amenities,
      wifi_network: next.wifi_network,
      wifi_password: next.wifi_password,
      status: next.status,
      max_guests: nextMaxGuests,
      peak_period_ranges: nextPeakRanges,
      updated_by: user.id,
    })
    .eq("id", propertyId);
  if (updateErr) {
    return { status: "error", message: updateErr.message };
  }

  await recordRevision({
    entityType: "property",
    entityId: propertyId,
    changedBy: user.id,
    before: {
      name: current.name,
      location: current.location,
      address: current.address,
      description: current.description,
      how_to: current.how_to,
      guidelines: current.guidelines,
      amenities: current.amenities ?? [],
      wifi_network: current.wifi_network,
      wifi_password: current.wifi_password,
      status: current.status,
      max_guests: current.max_guests ?? null,
      peak_period_ranges: JSON.stringify(current.peak_period_ranges ?? []),
    },
    after: {
      ...next,
      max_guests: nextMaxGuests,
      peak_period_ranges: JSON.stringify(nextPeakRanges),
    },
  });

  revalidatePath(`/properties/${current.slug}`);
  revalidatePath(`/properties/${current.slug}/edit`);
  revalidatePath("/properties");
  return { status: "saved" };
}
