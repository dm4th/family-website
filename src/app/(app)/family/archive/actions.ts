"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { recordRevision } from "@/lib/revisions";
import type { SaveState } from "@/components/authoring/save-state";

// ----------------------------------------------------------------------------
// Small form helpers (mirrors properties/[slug]/actions.ts conventions).
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

/**
 * Parse the JSON a {@link FuzzyDateField} submits into the two photo columns.
 * Invalid/empty input clears both. An exact date populates `taken_on`; an
 * approximate phrase populates `circa`; never both.
 */
function parseFuzzyDate(raw: string | null): { taken_on: string | null; circa: string | null } {
  if (!raw) return { taken_on: null, circa: null };
  let parsed: FuzzyDate;
  try {
    parsed = JSON.parse(raw) as FuzzyDate;
  } catch {
    return { taken_on: null, circa: null };
  }
  if (parsed?.precision === "exact" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) {
    return { taken_on: parsed.date, circa: null };
  }
  if (parsed?.precision === "circa" && parsed.text.trim()) {
    return { taken_on: null, circa: parsed.text.trim() };
  }
  return { taken_on: null, circa: null };
}

// ----------------------------------------------------------------------------
// Albums — wiki-style create/edit. Attribution + revisions are enforced here in
// the Server Action (the tables have open family RLS with no audit trigger).
// ----------------------------------------------------------------------------

export async function createAlbum(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { status: "error", message: "Not signed in" };
  }

  const title = readText(formData, "title");
  if (!title) {
    return { status: "error", message: "A title is required." };
  }

  const { data: album, error } = await supabase
    .from("albums")
    .insert({
      title,
      era: readText(formData, "era"),
      description: readText(formData, "description"),
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error || !album) {
    return { status: "error", message: error?.message ?? "Could not create album." };
  }

  await recordRevision({
    entityType: "album",
    entityId: album.id,
    changedBy: user.id,
    before: {},
    after: {
      title,
      era: readText(formData, "era"),
      description: readText(formData, "description"),
    },
  });

  revalidatePath("/family/archive");
  return { status: "saved" };
}

export async function updateAlbum(
  albumId: string,
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { status: "error", message: "Not signed in" };
  }

  const { data: current, error: currentErr } = await supabase
    .from("albums")
    .select("title, era, description")
    .eq("id", albumId)
    .single();
  if (currentErr || !current) {
    return { status: "error", message: "Album not found" };
  }

  const title = readText(formData, "title");
  if (!title) {
    return { status: "error", message: "A title is required." };
  }

  const next = {
    title,
    era: readText(formData, "era"),
    description: readText(formData, "description"),
  };

  const { error: updateErr } = await supabase
    .from("albums")
    .update({ ...next, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", albumId);
  if (updateErr) {
    return { status: "error", message: updateErr.message };
  }

  await recordRevision({
    entityType: "album",
    entityId: albumId,
    changedBy: user.id,
    before: {
      title: current.title,
      era: current.era,
      description: current.description,
    },
    after: next,
  });

  revalidatePath(`/family/archive/${albumId}`);
  revalidatePath("/family/archive");
  return { status: "saved" };
}

// ----------------------------------------------------------------------------
// Per-photo archive metadata — fuzzy dating, caption, and people tagging
// (members via profiles are handled elsewhere; here we tag `people`, which
// covers ancestors too). Records a "photo" revision so edits stay attributable.
// ----------------------------------------------------------------------------
export async function updatePhotoArchiveMeta(
  photoId: string,
  albumId: string,
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { status: "error", message: "Not signed in" };
  }

  const { data: current, error: currentErr } = await supabase
    .from("photos")
    .select("caption, taken_on, circa")
    .eq("id", photoId)
    .single();
  if (currentErr || !current) {
    return { status: "error", message: "Photo not found" };
  }

  const caption = readText(formData, "caption");
  const { taken_on, circa } = parseFuzzyDate(readText(formData, "date"));

  const { error: updateErr } = await supabase
    .from("photos")
    .update({ caption, taken_on, circa })
    .eq("id", photoId);
  if (updateErr) {
    return { status: "error", message: updateErr.message };
  }

  // Sync people tags: add the newly-selected, remove the deselected. The photo
  // uploader (or an admin) can remove; non-uploaders can still add.
  const nextPersonIds = new Set(
    formData.getAll("people").filter((v): v is string => typeof v === "string"),
  );
  const { data: existingRows } = await supabase
    .from("photo_people")
    .select("person_id")
    .eq("photo_id", photoId);
  const existingIds = new Set((existingRows ?? []).map((r) => r.person_id as string));

  const toAdd = [...nextPersonIds].filter((id) => !existingIds.has(id));
  const toRemove = [...existingIds].filter((id) => !nextPersonIds.has(id));

  if (toAdd.length > 0) {
    await supabase.from("photo_people").insert(
      toAdd.map((personId) => ({
        photo_id: photoId,
        person_id: personId,
        added_by: user.id,
      })),
    );
  }
  if (toRemove.length > 0) {
    await supabase
      .from("photo_people")
      .delete()
      .eq("photo_id", photoId)
      .in("person_id", toRemove);
  }

  await recordRevision({
    entityType: "photo",
    entityId: photoId,
    changedBy: user.id,
    before: {
      caption: current.caption,
      taken_on: current.taken_on,
      circa: current.circa,
      people: [...existingIds].sort(),
    },
    after: {
      caption,
      taken_on,
      circa,
      people: [...nextPersonIds].sort(),
    },
  });

  revalidatePath(`/family/archive/${albumId}`);
  return { status: "saved" };
}

// ----------------------------------------------------------------------------
// Curation: remove a photo from an album (the photo itself survives) and set
// an album's cover. Both are open to any family member (wiki posture).
// ----------------------------------------------------------------------------
export type ActionResult = { ok: true } | { ok: false; message: string };

export async function removePhotoFromAlbum(
  albumId: string,
  photoId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, message: "Not signed in" };
  }

  const { error } = await supabase
    .from("album_photos")
    .delete()
    .eq("album_id", albumId)
    .eq("photo_id", photoId);
  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath(`/family/archive/${albumId}`);
  revalidatePath("/family/archive");
  return { ok: true };
}

export async function setAlbumCover(
  albumId: string,
  photoId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, message: "Not signed in" };
  }

  const { error } = await supabase
    .from("albums")
    .update({ cover_photo_id: photoId, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", albumId);
  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath(`/family/archive/${albumId}`);
  revalidatePath("/family/archive");
  return { ok: true };
}
