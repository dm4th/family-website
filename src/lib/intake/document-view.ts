// The browser-safe half of intake document listing (PRD 33).
//
// The shape of a listed document and the two functions that turn it into words,
// kept apart from `documents.ts` because that module reaches for the server
// Supabase client (and so `next/headers`). The panel that renders these rows is
// a client component; without this split it drags the server client into the
// browser bundle.

export type IntakeDocumentRow = {
  id: string;
  storagePath: string;
  contentType: string;
  byteSize: number;
  intent: string;
  createdAt: string;
  uploaderName: string;
  /** The row survives but its object is gone. Listed, and still deletable. */
  objectMissing: boolean;
  /** Uploader or site admin, matching the row and storage delete policies. */
  canDelete: boolean;
};

/** Member-facing name for what was read, from the extraction intent. */
export function intakeKindLabel(intent: string): string {
  switch (intent) {
    case "note":
      return "Handwritten note";
    case "calendar":
      return "Due date";
    case "dictation":
      // Not a document at all — a stored transcript of what someone said (PRD
      // 34). It sits in the same bucket with the same row so the panel can see,
      // open, and remove it like everything else.
      return "Spoken note";
    default:
      return "Bill or statement";
  }
}

/** Rough file size, in the units a person reads rather than exact bytes. */
export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
