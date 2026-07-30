"use server";

/**
 * Property reminders — the gated write path (PRD 32, slice 3).
 *
 * These are ordinary property-data actions, built the same way contacts and
 * bookings are: authenticate, validate, write, `recordRevision`. Smart Intake
 * pre-fills the form that calls them, exactly as it pre-fills the contact form,
 * and gets no special privileges for doing so. Guests are refused here as well
 * as by RLS.
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { resolveViewer } from "@/lib/guest";
import { recordRevision } from "@/lib/revisions";
import { isReminderRecurrence, parseYmd } from "@/lib/reminders";
import type { ReminderRecurrence } from "@/lib/db/schema";

export type ReminderFormState =
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

/** The editable shape, validated once for both create and update. */
type ReminderInput = {
  title: string;
  notes: string | null;
  due_date: string;
  recurrence: ReminderRecurrence;
};

function readReminder(formData: FormData): ReminderInput | { error: string } {
  const title = readText(formData, "title");
  if (!title) {
    return { error: "Give the reminder a short name, like \"Water bill\"." };
  }

  const dueDate = readText(formData, "due_date");
  if (!dueDate) {
    return { error: "A reminder needs a date." };
  }
  // Checked against the real calendar, not just the shape: a browser date input
  // can't produce "2026-02-31", but a pre-filled value read off a document can.
  if (!parseYmd(dueDate)) {
    return { error: "That date doesn't look right. Please check it." };
  }

  const rawRecurrence = readText(formData, "recurrence") ?? "none";
  if (!isReminderRecurrence(rawRecurrence)) {
    return { error: "That repeat option isn't one we know." };
  }

  return {
    title,
    notes: readText(formData, "notes"),
    due_date: dueDate,
    recurrence: rawRecurrence,
  };
}

/** Everything a reminder change touches, so the calendars don't go stale. */
function revalidateReminder(slug: string) {
  revalidatePath(`/properties/${slug}`);
  revalidatePath(`/properties/${slug}/calendar`);
  revalidatePath("/calendar");
}

export async function addPropertyReminder(
  propertyId: string,
  propertySlug: string,
  _prev: ReminderFormState,
  formData: FormData,
): Promise<ReminderFormState> {
  const viewer = await resolveViewer();
  if (!viewer) return { status: "error", message: "Not signed in" };
  if (viewer.isGuest) {
    return { status: "error", message: "Guests can't add reminders." };
  }

  const input = readReminder(formData);
  if ("error" in input) return { status: "error", message: input.error };

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("property_reminders")
    .insert({
      property_id: propertyId,
      ...input,
      created_by: viewer.userId,
      updated_by: viewer.userId,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return {
      status: "error",
      message: error?.message ?? "Could not save the reminder.",
    };
  }

  await recordRevision({
    entityType: "property_reminder",
    entityId: inserted.id,
    changedBy: viewer.userId,
    before: {},
    after: input,
  });

  revalidateReminder(propertySlug);
  return { status: "saved" };
}

export async function updatePropertyReminder(
  reminderId: string,
  propertySlug: string,
  _prev: ReminderFormState,
  formData: FormData,
): Promise<ReminderFormState> {
  const viewer = await resolveViewer();
  if (!viewer) return { status: "error", message: "Not signed in" };
  if (viewer.isGuest) {
    return { status: "error", message: "Guests can't change reminders." };
  }

  const input = readReminder(formData);
  if ("error" in input) return { status: "error", message: input.error };

  const supabase = await createClient();
  const { data: current, error: currentErr } = await supabase
    .from("property_reminders")
    .select("title, notes, due_date, recurrence")
    .eq("id", reminderId)
    .single();
  if (currentErr || !current) {
    return { status: "error", message: "Reminder not found." };
  }

  const { error: updateErr } = await supabase
    .from("property_reminders")
    .update({ ...input, updated_by: viewer.userId })
    .eq("id", reminderId);
  if (updateErr) {
    return { status: "error", message: updateErr.message };
  }

  await recordRevision({
    entityType: "property_reminder",
    entityId: reminderId,
    changedBy: viewer.userId,
    before: current,
    after: input,
  });

  revalidateReminder(propertySlug);
  return { status: "saved" };
}

export async function deletePropertyReminder(
  reminderId: string,
  propertySlug: string,
): Promise<void> {
  const viewer = await resolveViewer();
  if (!viewer) throw new Error("Not signed in");
  if (viewer.isGuest) throw new Error("Guests can't remove reminders.");

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("property_reminders")
    .select("title, notes, due_date, recurrence")
    .eq("id", reminderId)
    .single();

  const { error } = await supabase
    .from("property_reminders")
    .delete()
    .eq("id", reminderId);
  if (error) throw new Error(error.message);

  if (current) {
    await recordRevision({
      entityType: "property_reminder",
      entityId: reminderId,
      changedBy: viewer.userId,
      before: current,
      after: {},
    });
  }

  revalidateReminder(propertySlug);
}
