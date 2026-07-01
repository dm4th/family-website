"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  PHOTOS_BUCKET,
  isValidPhotoStoragePath,
  thumbPathFor,
} from "@/lib/photo-utils";

export type RecordUploadResult =
  | { ok: true; photoId: string }
  | { ok: false; message: string };

type Attachment =
  | { kind: "profile"; profileId: string }
  | { kind: "property"; propertyId: string }
  // Family Legacy archive (PRD 11): a historical scan uploaded straight into an
  // album, attached to no living profile/property. Marks the photo is_archival
  // and links it into album_photos.
  | { kind: "album"; albumId: string };

export type PhotoSource = "upload" | "google_photos";

/**
 * Called after the client has uploaded the binary directly to Supabase
 * Storage. We only persist the small metadata row here — the file itself
 * never passes through the Vercel Function, which is why we don't hit the
 * 4.5MB Server-Action body limit.
 *
 * `source` distinguishes device uploads (default) from Google-Photos-Picker
 * imports. Picker imports also pass a `googleMediaId` for provenance — note
 * the id is session-scoped on Google's side and is not re-fetchable later.
 */
export async function recordUploadedPhoto(opts: {
  storagePath: string;
  attachment: Attachment;
  caption?: string | null;
  /** Additional profile UUIDs to tag in photo_subjects. */
  tagSubjectIds?: string[];
  source?: PhotoSource;
  googleMediaId?: string | null;
  /**
   * Fuzzy dating written at creation, used by the bulk zip import (PRD 18):
   * an exact `takenOn` (ISO YYYY-MM-DD, e.g. from EXIF) OR an approximate
   * `circa` era phrase. Only meaningful for archival (album) uploads; ignored
   * for profile/property attachments. Never both.
   */
  takenOn?: string | null;
  circa?: string | null;
}): Promise<RecordUploadResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, message: "Not signed in" };
  }

  if (!isValidPhotoStoragePath(opts.storagePath)) {
    return { ok: false, message: "Invalid storage path" };
  }

  const source: PhotoSource = opts.source ?? "upload";

  // Google-source rows must carry a media id, and only Google-source rows
  // are allowed to store one. This keeps the column meaningful for the
  // admin storage tally.
  if (source === "google_photos" && !opts.googleMediaId) {
    return { ok: false, message: "Missing Google media id" };
  }
  if (source !== "google_photos" && opts.googleMediaId) {
    return { ok: false, message: "googleMediaId only valid for google_photos source" };
  }

  const isArchival = opts.attachment.kind === "album";

  // Archival scans can carry a date at creation (EXIF or an era-for-all). Only
  // one of the two columns is ever set, and only for album uploads — a stray
  // date on a profile/property photo would be meaningless.
  const takenOn =
    isArchival && typeof opts.takenOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(opts.takenOn)
      ? opts.takenOn
      : null;
  const circa =
    isArchival && !takenOn && opts.circa?.trim() ? opts.circa.trim() : null;

  const photoInsert = {
    storage_path: opts.storagePath,
    caption: opts.caption?.trim() || null,
    taken_on: takenOn,
    circa,
    uploaded_by: user.id,
    property_id:
      opts.attachment.kind === "property" ? opts.attachment.propertyId : null,
    is_archival: isArchival,
    source,
    google_media_id: opts.googleMediaId ?? null,
  };

  const { data: photoRow, error: insertError } = await supabase
    .from("photos")
    .insert(photoInsert)
    .select("id")
    .single();

  if (insertError || !photoRow) {
    // Best-effort cleanup so we don't orphan the storage object the
    // client just uploaded (plus its thumbnail companion, if any).
    await supabase.storage
      .from(PHOTOS_BUCKET)
      .remove([opts.storagePath, thumbPathFor(opts.storagePath)]);
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
  } else if (opts.attachment.kind === "album") {
    // Link the scan into its album. Best-effort so a failed link never loses
    // the uploaded photo — it can be re-added, and per-photo dating/tagging
    // happens on the album page after upload.
    await supabase.from("album_photos").insert({
      album_id: opts.attachment.albumId,
      photo_id: photoRow.id,
      added_by: user.id,
    });
    revalidatePath(`/family/archive/${opts.attachment.albumId}`);
    revalidatePath("/family/archive");
  } else {
    revalidatePath("/properties");
    // The per-slug detail page revalidates via the client router.refresh().
  }
  revalidatePath("/profile/edit");

  return { ok: true, photoId: photoRow.id };
}

export type DeletePhotoResult =
  | { ok: true }
  | { ok: false; message: string };

export async function deletePhoto(
  photoId: string,
): Promise<DeletePhotoResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, message: "Not signed in" };
  }

  const { data: photo, error: fetchErr } = await supabase
    .from("photos")
    .select("storage_path, property_id")
    .eq("id", photoId)
    .single();
  if (fetchErr || !photo) {
    return { ok: false, message: "Photo not found" };
  }

  // Remove the storage object FIRST, while the photos row still exists. The
  // property-admin storage delete policy resolves the object back to its
  // photos row by path, so the row must be present for that check to pass.
  // (owner == uploaded_by for every photo we create, so the storage and
  // table delete policies authorize the same callers.)
  // Remove the display object and its thumbnail companion (PRD 17). Removing a
  // thumb path that was never generated (old/HEIC/GIF photos) is a harmless no-op.
  const { error: storageErr } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .remove([photo.storage_path, thumbPathFor(photo.storage_path)]);

  // Delete the metadata row and confirm a row was actually removed. A silent
  // empty delete means RLS filtered it out — i.e. the caller isn't the
  // uploader, a site admin, or a property admin for this photo — so report a
  // failure instead of a false success.
  const { data: deleted, error: deleteErr } = await supabase
    .from("photos")
    .delete()
    .eq("id", photoId)
    .select("id");
  if (deleteErr) {
    return { ok: false, message: deleteErr.message };
  }
  if (!deleted || deleted.length === 0) {
    return {
      ok: false,
      message: "You don't have permission to remove this photo.",
    };
  }

  // The row is gone (the user-visible state). If the object cleanup above
  // failed, log it so the admin storage tally can reconcile the orphan — but
  // don't fail the user-facing action over it.
  if (storageErr) {
    console.error("deletePhoto: storage cleanup failed", {
      photoId,
      storagePath: photo.storage_path,
      error: storageErr.message,
    });
  }

  revalidatePath("/family");
  if (photo.property_id) revalidatePath("/properties");
  return { ok: true };
}
