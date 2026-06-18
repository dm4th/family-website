// Browser-only client for the Google Photos Picker REST API.
// https://developers.google.com/photos/picker/reference/rest
//
// The flow is:
//   1. createSession(token)          → returns { id, pickerUri, pollingConfig }
//   2. open pickerUri in a new tab; user picks photos in Google's UI
//   3. pollSession(token, id)        until mediaItemsSet === true
//   4. listMediaItems(token, id)     → mediaItems (page if needed)
//   5. downloadAtSize(token, baseUrl, …)
//   6. deleteSession(token, id)
//
// All requests use the user's OAuth access token. The token never touches
// our server — bytes flow browser → Supabase Storage directly, same as
// the existing PhotoUpload component.

export const PHOTOS_PICKER_SCOPE =
  "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";

const BASE = "https://photospicker.googleapis.com/v1";

export type PickerSession = {
  id: string;
  pickerUri: string;
  pollingConfig?: {
    /** Backend-recommended poll interval, e.g. "5s" (Duration string). */
    pollInterval?: string;
    /** Upper bound; if exceeded we should give up. */
    timeoutIn?: string;
  };
  mediaItemsSet: boolean;
  expireTime?: string;
};

export type PickedMediaItem = {
  id: string;
  createTime?: string;
  type?: "TYPE_UNSPECIFIED" | "PHOTO" | "VIDEO";
  mediaFile: {
    baseUrl: string;
    mimeType?: string;
    filename?: string;
    mediaFileMetadata?: {
      width?: number;
      height?: number;
      cameraMake?: string;
      cameraModel?: string;
    };
  };
};

type ListMediaItemsResponse = {
  mediaItems?: PickedMediaItem[];
  nextPageToken?: string;
};

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

async function jsonOrThrow<T>(res: Response, context: string): Promise<T> {
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = (body?.error?.message as string) ?? "";
    } catch {
      // ignore
    }
    throw new Error(
      `${context}: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`,
    );
  }
  return (await res.json()) as T;
}

export async function createSession(token: string): Promise<PickerSession> {
  const res = await fetch(`${BASE}/sessions`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    // The API accepts an empty body to mint a session with default config.
    body: "{}",
  });
  return jsonOrThrow<PickerSession>(res, "Create picker session");
}

export async function getSession(
  token: string,
  sessionId: string,
): Promise<PickerSession> {
  const res = await fetch(
    `${BASE}/sessions/${encodeURIComponent(sessionId)}`,
    { headers: authHeaders(token) },
  );
  return jsonOrThrow<PickerSession>(res, "Get picker session");
}

export async function deleteSession(
  token: string,
  sessionId: string,
): Promise<void> {
  // Best-effort cleanup — don't throw if the session was already removed.
  await fetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    headers: authHeaders(token),
  }).catch(() => undefined);
}

export async function listMediaItems(
  token: string,
  sessionId: string,
): Promise<PickedMediaItem[]> {
  const out: PickedMediaItem[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ sessionId, pageSize: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`${BASE}/mediaItems?${params.toString()}`, {
      headers: authHeaders(token),
    });
    const body = await jsonOrThrow<ListMediaItemsResponse>(
      res,
      "List media items",
    );
    if (body.mediaItems) out.push(...body.mediaItems);
    pageToken = body.nextPageToken;
  } while (pageToken);
  return out;
}

/**
 * Hosts we will attach the user's OAuth bearer token to. Picker baseUrls
 * are served from Google's user-content CDN; gating on this suffix prevents
 * a (theoretical) injected URL from siphoning the token to another origin.
 */
const ALLOWED_DOWNLOAD_HOST_SUFFIX = ".googleusercontent.com";

function isAllowedDownloadHost(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:") return false;
    return u.hostname.endsWith(ALLOWED_DOWNLOAD_HOST_SUFFIX);
  } catch {
    return false;
  }
}

/**
 * Download a Picker mediaItem at a constrained size. Google's image URLs
 * accept `=w<width>-h<height>` for resize and `=d` for "download" (strips
 * EXIF, but the file extension/MIME come from the baseUrl). We use resize
 * so we never download the full original — that defeats the quota goal.
 *
 * The token is required: Picker baseUrls are not publicly accessible.
 * The host is checked first to avoid emitting the bearer token to anything
 * outside Google's user-content CDN.
 */
export async function downloadAtSize(opts: {
  token: string;
  baseUrl: string;
  maxWidth: number;
  maxHeight: number;
}): Promise<Blob> {
  if (!isAllowedDownloadHost(opts.baseUrl)) {
    throw new Error(
      `Refusing to download from non-Google host: ${safeHostFor(opts.baseUrl)}`,
    );
  }
  const url = `${opts.baseUrl}=w${opts.maxWidth}-h${opts.maxHeight}`;
  const res = await fetch(url, { headers: authHeaders(opts.token) });
  if (!res.ok) {
    throw new Error(`Download from Google: ${res.status} ${res.statusText}`);
  }
  return res.blob();
}

function safeHostFor(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return "<unparseable>";
  }
}

/**
 * Parse a Google Duration string ("5s", "1.500s") into a millisecond count.
 * Falls back to a default if the value is missing or unparseable.
 */
export function parseDurationMs(value: string | undefined, fallbackMs: number): number {
  if (!value) return fallbackMs;
  const match = /^([0-9]+(?:\.[0-9]+)?)s$/.exec(value);
  if (!match) return fallbackMs;
  return Math.round(parseFloat(match[1]!) * 1000);
}

/**
 * Poll the session until the user has finished picking (or the deadline
 * passes). Honors the server-recommended `pollInterval`; clamps to
 * [1s, 10s] for safety.
 */
export async function pollSession(opts: {
  token: string;
  sessionId: string;
  pollIntervalHint?: string;
  /** Hard cap on total wait, default 5min. */
  timeoutMs?: number;
  signal?: AbortSignal;
  onTick?: (elapsedMs: number) => void;
}): Promise<PickerSession> {
  const start = Date.now();
  const timeout = opts.timeoutMs ?? 5 * 60 * 1000;
  const rawInterval = parseDurationMs(opts.pollIntervalHint, 3000);
  const interval = Math.min(Math.max(rawInterval, 1000), 10_000);

  while (true) {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (Date.now() - start > timeout) {
      throw new Error("Picker timed out waiting for selection");
    }
    const session = await getSession(opts.token, opts.sessionId);
    if (session.mediaItemsSet) return session;
    opts.onTick?.(Date.now() - start);
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, interval);
      opts.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    });
  }
}
