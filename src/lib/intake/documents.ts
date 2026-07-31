// Intake document listing (PRD 33).
//
// Server-side read for the "Documents We've Read" panel. Every document Smart
// Intake reads is kept in the private `intake` bucket with a provenance row, and
// until this PRD there was no way to see either from the app. This is the "see"
// half; `deleteIntakeDocument` in the intake actions is the "remove" half.
//
// Read-only. Nothing here writes, and it deliberately mints no signed URLs —
// opening a document is a separate, deliberate act (see `intakeDocumentUrl`), so
// a member who never clicks Open never has a 30-minute link to a bill sitting in
// their page source.

import { createClient } from "@/lib/supabase/server";
import { resolveViewer } from "@/lib/guest";
import { INTAKE_BUCKET } from "@/lib/intake/schema";
import type { IntakeDocumentRow } from "@/lib/intake/document-view";

type Joined = {
  id: string;
  storage_path: string;
  content_type: string;
  byte_size: number;
  intent: string;
  created_at: string;
  uploaded_by: string;
  profiles: { full_name: string | null; email: string } | null;
};

export async function loadIntakeDocuments(
  propertyId: string,
): Promise<IntakeDocumentRow[]> {
  const viewer = await resolveViewer();
  if (!viewer || viewer.isGuest) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("intake_documents")
    .select(
      "id, storage_path, content_type, byte_size, intent, created_at, uploaded_by, profiles(full_name, email)",
    )
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .returns<Joined[]>();
  if (error || !data) return [];

  const present = await storedPaths(
    supabase,
    data.map((r) => r.storage_path),
  );

  return data.map((r) => ({
    id: r.id,
    storagePath: r.storage_path,
    contentType: r.content_type,
    byteSize: r.byte_size,
    intent: r.intent,
    createdAt: r.created_at,
    uploaderName: r.profiles?.full_name || r.profiles?.email || "A family member",
    objectMissing: !present.has(r.storage_path),
    canDelete: viewer.isAdmin || viewer.userId === r.uploaded_by,
  }));
}

/**
 * Which of these paths still have an object behind them.
 *
 * Intake paths are `xx/uuid.ext`, so this lists each distinct two-character
 * folder once rather than probing every path — at most 256 calls in the worst
 * case, and in practice one or two for a family's stack of bills. Listing is
 * used instead of a signed-URL probe because minting a URL to answer "does this
 * exist?" would hand out a live link to every document just to draw the list.
 *
 * On a listing failure the paths are reported present. A wrongly-drawn "photo no
 * longer stored" label is worse than none: it invites a member to write off a
 * document that is actually still sitting in the bucket.
 */
async function storedPaths(
  supabase: Awaited<ReturnType<typeof createClient>>,
  paths: string[],
): Promise<Set<string>> {
  const prefixes = [...new Set(paths.map((p) => p.split("/")[0]))].filter(
    Boolean,
  );
  const present = new Set<string>();

  const listings = await Promise.all(
    prefixes.map(async (prefix) => {
      const { data, error } = await supabase.storage
        .from(INTAKE_BUCKET)
        .list(prefix, { limit: 1000 });
      return { prefix, names: data?.map((o) => o.name) ?? null, error };
    }),
  );

  for (const { prefix, names } of listings) {
    if (!names) {
      // Couldn't read this folder. Assume everything under it is fine.
      for (const p of paths) if (p.startsWith(`${prefix}/`)) present.add(p);
      continue;
    }
    for (const name of names) present.add(`${prefix}/${name}`);
  }

  return present;
}
