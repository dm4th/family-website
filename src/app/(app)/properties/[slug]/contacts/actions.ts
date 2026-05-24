"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordRevision } from "@/lib/revisions";

export type ContactFormState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "deleted" }
  | { status: "error"; message: string };

function readText(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

export async function addPropertyContact(
  propertyId: string,
  propertySlug: string,
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { status: "error", message: "Not signed in" };
  }

  const label = readText(formData, "label");
  if (!label) {
    return { status: "error", message: "Label is required." };
  }

  // Place at the end of the list.
  const { data: maxRow } = await supabase
    .from("property_contacts")
    .select("sort_order")
    .eq("property_id", propertyId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const next = {
    property_id: propertyId,
    label,
    name: readText(formData, "name"),
    phone: readText(formData, "phone"),
    email: readText(formData, "email"),
    notes: readText(formData, "notes"),
    sort_order: (maxRow?.sort_order ?? 0) + 10,
    updated_by: user.id,
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("property_contacts")
    .insert(next)
    .select("id")
    .single();
  if (insertErr || !inserted) {
    return {
      status: "error",
      message: insertErr?.message ?? "Could not add contact.",
    };
  }

  await recordRevision({
    entityType: "property_contact",
    entityId: inserted.id,
    changedBy: user.id,
    before: {},
    after: {
      label: next.label,
      name: next.name,
      phone: next.phone,
      email: next.email,
      notes: next.notes,
    },
  });

  revalidatePath(`/properties/${propertySlug}`);
  revalidatePath(`/properties/${propertySlug}/edit`);
  return { status: "saved" };
}

export async function updatePropertyContact(
  contactId: string,
  propertySlug: string,
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { status: "error", message: "Not signed in" };
  }

  const { data: current, error: currentErr } = await supabase
    .from("property_contacts")
    .select("label, name, phone, email, notes")
    .eq("id", contactId)
    .single();
  if (currentErr || !current) {
    return { status: "error", message: "Contact not found." };
  }

  const label = readText(formData, "label");
  if (!label) {
    return { status: "error", message: "Label is required." };
  }

  const next = {
    label,
    name: readText(formData, "name"),
    phone: readText(formData, "phone"),
    email: readText(formData, "email"),
    notes: readText(formData, "notes"),
    updated_by: user.id,
  };

  const { error: updateErr } = await supabase
    .from("property_contacts")
    .update(next)
    .eq("id", contactId);
  if (updateErr) {
    return { status: "error", message: updateErr.message };
  }

  await recordRevision({
    entityType: "property_contact",
    entityId: contactId,
    changedBy: user.id,
    before: current,
    after: {
      label: next.label,
      name: next.name,
      phone: next.phone,
      email: next.email,
      notes: next.notes,
    },
  });

  revalidatePath(`/properties/${propertySlug}`);
  revalidatePath(`/properties/${propertySlug}/edit`);
  return { status: "saved" };
}

export async function deletePropertyContact(
  contactId: string,
  propertySlug: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: current } = await supabase
    .from("property_contacts")
    .select("label, name, phone, email, notes")
    .eq("id", contactId)
    .single();

  const { error } = await supabase
    .from("property_contacts")
    .delete()
    .eq("id", contactId);
  if (error) throw new Error(error.message);

  if (current) {
    await recordRevision({
      entityType: "property_contact",
      entityId: contactId,
      changedBy: user.id,
      before: current,
      after: {},
    });
  }

  revalidatePath(`/properties/${propertySlug}`);
  revalidatePath(`/properties/${propertySlug}/edit`);
}
