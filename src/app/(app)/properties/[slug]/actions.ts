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
      "slug, name, location, address, description, how_to, guidelines, amenities, status",
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

  const next = {
    name,
    location: readText(formData, "location"),
    address: readText(formData, "address"),
    description: readText(formData, "description"),
    how_to: readText(formData, "how_to"),
    guidelines: readText(formData, "guidelines"),
    amenities: parseAmenities(readText(formData, "amenities")),
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
      status: next.status,
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
      status: current.status,
    },
    after: next,
  });

  revalidatePath(`/properties/${current.slug}`);
  revalidatePath(`/properties/${current.slug}/edit`);
  revalidatePath("/properties");
  return { status: "saved" };
}
