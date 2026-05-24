"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  PHOTOS_BUCKET,
  generatePhotoPath,
  isAllowedMime,
  MAX_PHOTO_BYTES,
} from "@/lib/photos";

export type UploadResult =
  | { ok: true; photoId: string }
  | { ok: false; message: string };

type Attachment =
  | { kind: "profile"; profileId: string }
  | { kind: "property"; propertyId: string };

/**
 * Upload a single photo, attach it to the given target (profile or property),
 * and revalidate the relevant page.
 *
 * Expected FormData fields:
 *   - file:           the image
 *   - attachment:     "profile" | "property"
 *   - attachmentId:   the target UUID
 *   - caption:        optional
 *   - tagSubjectIds:  comma-separated profile UUIDs that appear in the photo
 *                     (in addition to the attachment target when it's a profile)
 */
export async function uploadPhoto(formData: FormData): Promise<UploadResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, message: "Not signed in" };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "No file provided" };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return {
      ok: false,
      message: `File too large (max ${Math.round(MAX_PHOTO_BYTES / 1024 / 1024)}MB)`,
    };
  }
  if (!isAllowedMime(file.type)) {
    return { ok: false, message: `Unsupported file type: ${file.type}` };
  }

  const attachment = parseAttachment(formData);
  if (!attachment) {
    return { ok: false, message: "Missing or invalid attachment target" };
  }

  const caption = readText(formData, "caption");
  const extraSubjectIds = readSubjectIds(formData);

  // 1. Upload to storage.
  const storagePath = generatePhotoPath(file.name);
  const { error: uploadError } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) {
    return { ok: false, message: `Upload failed: ${uploadError.message}` };
  }

  // 2. Insert the DB row.
  const photoInsert = {
    storage_path: storagePath,
    caption,
    uploaded_by: user.id,
    property_id: attachment.kind === "property" ? attachment.propertyId : null,
  };
  const { data: photoRow, error: insertError } = await supabase
    .from("photos")
    .insert(photoInsert)
    .select("id")
    .single();

  if (insertError || !photoRow) {
    // Best-effort cleanup so we don't orphan the storage object.
    await supabase.storage.from(PHOTOS_BUCKET).remove([storagePath]);
    return {
      ok: false,
      message: `Could not save photo: ${insertError?.message ?? "unknown"}`,
    };
  }

  // 3. Tag subjects.
  const subjectIds = new Set<string>(extraSubjectIds);
  if (attachment.kind === "profile") subjectIds.add(attachment.profileId);
  if (subjectIds.size > 0) {
    const subjectRows = Array.from(subjectIds).map((profileId) => ({
      photo_id: photoRow.id,
      profile_id: profileId,
    }));
    await supabase.from("photo_subjects").insert(subjectRows);
    // Tagging is best-effort; the photo itself still uploaded successfully.
  }

  // 4. Revalidate the surfaces that show this photo.
  if (attachment.kind === "profile") {
    revalidatePath(`/family/${attachment.profileId}`);
  } else {
    revalidatePath(`/properties`);
    // chunk 5 will add a per-slug detail page; tolerate it not existing yet.
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

function parseAttachment(formData: FormData): Attachment | null {
  const kind = formData.get("attachment");
  const id = formData.get("attachmentId");
  if (typeof id !== "string" || !id) return null;
  if (kind === "profile") return { kind: "profile", profileId: id };
  if (kind === "property") return { kind: "property", propertyId: id };
  return null;
}

function readSubjectIds(formData: FormData): string[] {
  const raw = formData.get("tagSubjectIds");
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s));
}

function readText(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : null;
}
