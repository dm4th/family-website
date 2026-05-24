"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canManageProperty } from "@/lib/property-auth";

export type PropertyAdminActionState =
  | { status: "idle" }
  | { status: "added"; profileId: string }
  | { status: "error"; message: string };

export async function addPropertyAdmin(
  propertyId: string,
  propertySlug: string,
  _prev: PropertyAdminActionState,
  formData: FormData,
): Promise<PropertyAdminActionState> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { status: "error", message: "Not signed in" };
    }

    const { ok } = await canManageProperty(propertyId);
    if (!ok) {
      return {
        status: "error",
        message: "Only site admins or this property's admins can grant access.",
      };
    }

    const profileId = formData.get("profile_id");
    if (typeof profileId !== "string" || !/^[0-9a-f-]{36}$/i.test(profileId)) {
      return { status: "error", message: "Please pick a family member." };
    }

    const { error } = await supabase
      .from("property_admins")
      .insert({
        property_id: propertyId,
        profile_id: profileId,
        granted_by: user.id,
      });
    if (error) {
      if (/duplicate key/i.test(error.message)) {
        return {
          status: "error",
          message: "That person is already a property admin.",
        };
      }
      return { status: "error", message: error.message };
    }

    revalidatePath(`/properties/${propertySlug}/edit`);
    revalidatePath(`/properties/${propertySlug}`);
    return { status: "added", profileId };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function removePropertyAdmin(
  propertyId: string,
  propertySlug: string,
  profileId: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Not signed in");

  const { ok } = await canManageProperty(propertyId);
  if (!ok) throw new Error("Not authorized");

  const { error } = await supabase
    .from("property_admins")
    .delete()
    .eq("property_id", propertyId)
    .eq("profile_id", profileId);
  if (error) throw new Error(error.message);

  revalidatePath(`/properties/${propertySlug}/edit`);
  revalidatePath(`/properties/${propertySlug}`);
}
