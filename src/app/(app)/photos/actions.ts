"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PHOTOS_BUCKET } from "@/lib/photo-utils";

export type RecordUploadResult =
  | { ok: true; photoId: string }
  | { ok: false; message: string };

type Attachment =
  | { kind: "profile"; profileId: string }
  | { kind: "property"; propertyId: string };

/**
 * Called after the client has uploaded the binary directly to Supabase
 * Storage. We only persist the small metadata row here — the file itself
 * never passes through the Vercel Function, which is why we don't hit the
 * 4.5MB Server-Action body limit.
 */
export async function recordUploadedPhoto(opts: {
  storagePath: string;
  attachment: Attachment;
  caption?: string | null;
  /** Additional profile UUIDs to tag in photo_subjects. */
  tagSubjectIds?: string[];
}): Promise<RecordUploadResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, message: "Not signed in" };
  }

  // Light sanity check on the storage path. The client generates it via
  // generatePhotoPath() — reject anything that doesn't match the format
  // to prevent attaching a row to arbitrary objects.
  if (!/^[0-9a-f]{2}\/[0-9a-f-]{36}(?:\.[a-z0-9]+)?$/i.test(opts.storagePath)) {
    return { ok: false, message: "Invalid storage path" };
  }

  const photoInsert = {
    storage_path: opts.storagePath,
    caption: opts.caption?.trim() || null,
    uploaded_by: user.id,
    property_id:
      opts.attachment.kind === "property" ? opts.attachment.propertyId : null,
  };

  const { data: photoRow, error: insertError } = await supabase
    .from("photos")
    .insert(photoInsert)
    .select("id")
    .single();

  if (insertError || !photoRow) {
    // Best-effort cleanup so we don't orphan the storage object the
    // client just uploaded.
    await supabase.storage.from(PHOTOS_BUCKET).remove([opts.storagePath]);
    return {
      ok: false,
      message: `Could not save photo: ${insertError?.message ?? "unknown"}`,
    };
  }

  // Tag subjects.
  const subjectIds = new Set<string>(opts.tagSubjectIds ?? []);
  if (opts.attachment.kind === "profile") {
    subjectIds.add(opts.attachment.profileId);
  }
  if (subjectIds.size > 0) {
    const subjectRows = Array.from(subjectIds).map((profileId) => ({
      photo_id: photoRow.id,
      profile_id: profileId,
    }));
    await supabase.from("photo_subjects").insert(subjectRows);
    // Tagging is best-effort; the photo itself still uploaded successfully.
  }

  if (opts.attachment.kind === "profile") {
    revalidatePath(`/family/${opts.attachment.profileId}`);
  } else {
    revalidatePath("/properties");
    // The per-slug detail page revalidates via the client router.refresh().
  }
  revalidatePath("/profile/edit");

  return { ok: true, photoId: photoRow.id };
}

export async function deletePhoto(photoId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error("Not signed in");
  }

  const { data: photo, error: fetchErr } = await supabase
    .from("photos")
    .select("storage_path, property_id")
    .eq("id", photoId)
    .single();
  if (fetchErr || !photo) {
    throw new Error("Photo not found");
  }

  // RLS enforces who can delete — these calls just fail-fast if not allowed.
  const { error: deleteErr } = await supabase
    .from("photos")
    .delete()
    .eq("id", photoId);
  if (deleteErr) {
    throw new Error(deleteErr.message);
  }

  await supabase.storage.from(PHOTOS_BUCKET).remove([photo.storage_path]);
  revalidatePath("/family");
  if (photo.property_id) revalidatePath("/properties");
}
