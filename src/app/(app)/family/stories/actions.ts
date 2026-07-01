"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { recordRevision } from "@/lib/revisions";
import type { SaveState } from "@/components/authoring/save-state";

// ----------------------------------------------------------------------------
// Form helpers (mirrors the other Legacy action modules).
// ----------------------------------------------------------------------------
function readText(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function personIds(formData: FormData): string[] {
  return formData.getAll("people").filter((v): v is string => typeof v === "string");
}

async function syncStoryPeople(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storyId: string,
  nextIds: Set<string>,
  userId: string,
): Promise<Set<string>> {
  const { data: existing } = await supabase
    .from("story_people")
    .select("person_id")
    .eq("story_id", storyId);
  const existingIds = new Set((existing ?? []).map((r) => r.person_id as string));

  const toAdd = [...nextIds].filter((id) => !existingIds.has(id));
  const toRemove = [...existingIds].filter((id) => !nextIds.has(id));

  if (toAdd.length > 0) {
    await supabase
      .from("story_people")
      .insert(toAdd.map((personId) => ({ story_id: storyId, person_id: personId, added_by: userId })));
  }
  if (toRemove.length > 0) {
    await supabase
      .from("story_people")
      .delete()
      .eq("story_id", storyId)
      .in("person_id", toRemove);
  }
  return existingIds;
}

// ----------------------------------------------------------------------------
// stories — wiki-style create/edit. `stories` has open family RLS with no audit
// trigger, so attribution is enforced here (created_by/updated_by + updated_at +
// recordRevision), exactly like events/albums/people.
// ----------------------------------------------------------------------------

export async function createStory(
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

  const body = readText(formData, "body");
  const albumId = readText(formData, "album_id");
  const eventId = readText(formData, "event_id");

  const { data: story, error } = await supabase
    .from("stories")
    .insert({
      title,
      body,
      album_id: albumId,
      event_id: eventId,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();
  if (error || !story) {
    return { status: "error", message: error?.message ?? "Could not save the story." };
  }

  const ids = new Set(personIds(formData));
  if (ids.size > 0) await syncStoryPeople(supabase, story.id, ids, user.id);

  await recordRevision({
    entityType: "story",
    entityId: story.id,
    changedBy: user.id,
    before: {},
    after: { title, body, album_id: albumId, event_id: eventId, people: [...ids].sort() },
  });

  revalidatePath("/family/stories");
  return { status: "saved" };
}

export async function updateStory(
  storyId: string,
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
    .from("stories")
    .select("title, body, album_id, event_id")
    .eq("id", storyId)
    .single();
  if (currentErr || !current) return { status: "error", message: "Story not found" };

  const title = readText(formData, "title");
  if (!title) return { status: "error", message: "A title is required." };

  const body = readText(formData, "body");
  const albumId = readText(formData, "album_id");
  const eventId = readText(formData, "event_id");

  const { error: updateErr } = await supabase
    .from("stories")
    .update({
      title,
      body,
      album_id: albumId,
      event_id: eventId,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", storyId);
  if (updateErr) return { status: "error", message: updateErr.message };

  const ids = new Set(personIds(formData));
  const existingIds = await syncStoryPeople(supabase, storyId, ids, user.id);

  await recordRevision({
    entityType: "story",
    entityId: storyId,
    changedBy: user.id,
    before: {
      title: current.title,
      body: current.body,
      album_id: current.album_id,
      event_id: current.event_id,
      people: [...existingIds].sort(),
    },
    after: { title, body, album_id: albumId, event_id: eventId, people: [...ids].sort() },
  });

  revalidatePath(`/family/stories/${storyId}`);
  revalidatePath("/family/stories");
  return { status: "saved" };
}

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function deleteStory(storyId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, message: "Not signed in" };

  const { error } = await supabase.from("stories").delete().eq("id", storyId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/family/stories");
  return { ok: true };
}
