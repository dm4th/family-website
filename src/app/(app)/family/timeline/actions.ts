"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { recordRevision } from "@/lib/revisions";
import { parseYear } from "@/lib/timeline";
import type { SaveState } from "@/components/authoring/save-state";

// ----------------------------------------------------------------------------
// Form helpers (mirrors family/archive + family/tree action conventions).
// ----------------------------------------------------------------------------
function readText(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

type FuzzyDate =
  | { precision: "exact"; date: string }
  | { precision: "circa"; text: string }
  | { precision: "none" };

function parseFuzzyDate(raw: string | null): { date: string | null; circa: string | null } {
  if (!raw) return { date: null, circa: null };
  let parsed: FuzzyDate;
  try {
    parsed = JSON.parse(raw) as FuzzyDate;
  } catch {
    return { date: null, circa: null };
  }
  if (parsed?.precision === "exact" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) {
    return { date: parsed.date, circa: null };
  }
  if (parsed?.precision === "circa" && parsed.text.trim()) {
    return { date: null, circa: parsed.text.trim() };
  }
  return { date: null, circa: null };
}

function personIds(formData: FormData): string[] {
  return formData.getAll("people").filter((v): v is string => typeof v === "string");
}

/** Sync an event's people tags against a desired set. Best-effort (audit log
 * carries the intent even if a row write is retried). */
async function syncEventPeople(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  nextIds: Set<string>,
  userId: string,
): Promise<Set<string>> {
  const { data: existing } = await supabase
    .from("event_people")
    .select("person_id")
    .eq("event_id", eventId);
  const existingIds = new Set((existing ?? []).map((r) => r.person_id as string));

  const toAdd = [...nextIds].filter((id) => !existingIds.has(id));
  const toRemove = [...existingIds].filter((id) => !nextIds.has(id));

  if (toAdd.length > 0) {
    await supabase
      .from("event_people")
      .insert(toAdd.map((personId) => ({ event_id: eventId, person_id: personId, added_by: userId })));
  }
  if (toRemove.length > 0) {
    await supabase
      .from("event_people")
      .delete()
      .eq("event_id", eventId)
      .in("person_id", toRemove);
  }
  return existingIds;
}

// ----------------------------------------------------------------------------
// events — wiki-style create/edit. `events` has open family RLS with no audit
// trigger, so attribution is enforced here (created_by/updated_by + updated_at +
// recordRevision), exactly like albums/people.
// ----------------------------------------------------------------------------

export async function createEvent(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { status: "error", message: "Not signed in" };

  const title = readText(formData, "title");
  if (!title) return { status: "error", message: "A title is required." };

  const { date, circa } = parseFuzzyDate(readText(formData, "date"));
  const year = parseYear(date, circa);
  if (year === null) {
    return { status: "error", message: "Please include a year (an exact date or a phrase like “summer 1968”)." };
  }

  const location = readText(formData, "location");
  const description = readText(formData, "description");

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      title,
      description,
      event_date: date,
      event_circa: circa,
      event_year: year,
      location,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();
  if (error || !event) {
    return { status: "error", message: error?.message ?? "Could not create the event." };
  }

  const ids = new Set(personIds(formData));
  if (ids.size > 0) await syncEventPeople(supabase, event.id, ids, user.id);

  await recordRevision({
    entityType: "event",
    entityId: event.id,
    changedBy: user.id,
    before: {},
    after: {
      title,
      description,
      event_date: date,
      event_circa: circa,
      event_year: year,
      location,
      people: [...ids].sort(),
    },
  });

  revalidatePath("/family/timeline");
  return { status: "saved" };
}

export async function updateEvent(
  eventId: string,
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { status: "error", message: "Not signed in" };

  const { data: current, error: currentErr } = await supabase
    .from("events")
    .select("title, description, event_date, event_circa, event_year, location")
    .eq("id", eventId)
    .single();
  if (currentErr || !current) return { status: "error", message: "Event not found" };

  const title = readText(formData, "title");
  if (!title) return { status: "error", message: "A title is required." };

  const { date, circa } = parseFuzzyDate(readText(formData, "date"));
  const year = parseYear(date, circa);
  if (year === null) {
    return { status: "error", message: "Please include a year (an exact date or a phrase like “summer 1968”)." };
  }

  const location = readText(formData, "location");
  const description = readText(formData, "description");

  const { error: updateErr } = await supabase
    .from("events")
    .update({
      title,
      description,
      event_date: date,
      event_circa: circa,
      event_year: year,
      location,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId);
  if (updateErr) return { status: "error", message: updateErr.message };

  const ids = new Set(personIds(formData));
  const existingIds = await syncEventPeople(supabase, eventId, ids, user.id);

  await recordRevision({
    entityType: "event",
    entityId: eventId,
    changedBy: user.id,
    before: {
      title: current.title,
      description: current.description,
      event_date: current.event_date,
      event_circa: current.event_circa,
      event_year: current.event_year,
      location: current.location,
      people: [...existingIds].sort(),
    },
    after: {
      title,
      description,
      event_date: date,
      event_circa: circa,
      event_year: year,
      location,
      people: [...ids].sort(),
    },
  });

  revalidatePath(`/family/timeline/events/${eventId}`);
  revalidatePath("/family/timeline");
  return { status: "saved" };
}

// ----------------------------------------------------------------------------
// Curation: link/unlink an archive photo to an event; delete an event.
// ----------------------------------------------------------------------------
export type ActionResult = { ok: true } | { ok: false; message: string };

export async function setEventPhoto(
  eventId: string,
  photoId: string,
  linked: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, message: "Not signed in" };

  if (linked) {
    const { error } = await supabase
      .from("event_photos")
      .insert({ event_id: eventId, photo_id: photoId, added_by: user.id });
    // Already linked (23505) is fine.
    if (error && (error as { code?: string }).code !== "23505") {
      return { ok: false, message: error.message };
    }
  } else {
    const { error } = await supabase
      .from("event_photos")
      .delete()
      .eq("event_id", eventId)
      .eq("photo_id", photoId);
    if (error) return { ok: false, message: error.message };
  }

  revalidatePath(`/family/timeline/events/${eventId}`);
  revalidatePath("/family/timeline");
  return { ok: true };
}

export async function deleteEvent(eventId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, message: "Not signed in" };

  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/family/timeline");
  return { ok: true };
}
