// Browser-only client for the Google Picker, restricted to Google Docs.
// https://developers.google.com/workspace/drive/picker/guides/web-picker
//
// The flow is:
//   1. requestAccessToken({ scope: DOCS_PICKER_SCOPE })   → per-pick consent
//   2. pickGoogleDoc({ token })                           → user picks one doc
//   3. exportDocText(fileId, token)                       → plain text
//   4. hand the string to `extractPaste` (PRD 37's engine)
//
// The token never touches our server. The server needs the *text*, not Google
// access, so there is nothing to store: no refresh token, no standing
// connection, no new server secret. Same posture as the Photos Picker (PRD 05).
//
// Why `drive.file` and not `drive.readonly`: with `drive.file` the picker
// itself is the grant. The app receives access to exactly the one file the
// member chose and can never list, read, or even see the existence of anything
// else in their Drive. It is the narrowest scope that can do this job.

import { getGoogleOAuthClientId } from "./identity";

export const DOCS_PICKER_SCOPE = "https://www.googleapis.com/auth/drive.file";

/** The only mime type this door accepts. Not Sheets, not Slides, not PDFs. */
export const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";

const GAPI_SRC = "https://apis.google.com/js/api.js";

/**
 * Two more public config values, both required by Google for a `drive.file`
 * picker and neither of them a secret:
 *
 * - The developer key is a browser API key. It is meant to be visible in page
 *   source; it is restricted by HTTP referrer in the Cloud console, not by
 *   secrecy.
 * - The app ID is the Cloud *project number*, which Google requires via
 *   `setAppId` specifically so that picker-granted `drive.file` access can be
 *   tied back to this app. It appears in the consent screen already.
 *
 * PRD 38 predicted no new env vars. That turned out to be wrong: the Photos
 * Picker (PRD 05) is a REST session API that needs only an OAuth token, while
 * the Drive Picker is a JavaScript widget that needs both of these. Recorded in
 * the PRD's Implementation section rather than worked around, because there is
 * no supported way to run this picker without them.
 */
export function getPickerApiKey(): string {
  const key = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY;
  if (!key) {
    throw new Error(
      "NEXT_PUBLIC_GOOGLE_PICKER_API_KEY is not configured. " +
        "See prds/38-connect-google-doc.md §Implementation.",
    );
  }
  return key;
}

export function getPickerAppId(): string {
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER;
  if (!id) {
    throw new Error(
      "NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER is not configured. " +
        "See prds/38-connect-google-doc.md §Implementation.",
    );
  }
  return id;
}

/**
 * Whether the Connect Google Doc door can open at all.
 *
 * Read as three separate literal `process.env.NEXT_PUBLIC_*` member
 * expressions because that is the form Next.js inlines at build time; pulling
 * them through a variable would leave `undefined` in the browser bundle.
 *
 * Callers use this to decide whether to *render* the door. A button that
 * cannot work should not be on the page.
 */
export function isDocsPickerConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID &&
      process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY &&
      process.env.NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER,
  );
}

// --- the picker script ------------------------------------------------------

// Minimal subset of the picker surface we use. The full types live in
// @types/google.picker, which we'd rather not pull in for one builder chain.
type PickerDoc = {
  id: string;
  name?: string;
  mimeType?: string;
  url?: string;
};

type PickerResponse = {
  action: string;
  docs?: PickerDoc[];
};

type PickerBuilder = {
  addView: (view: unknown) => PickerBuilder;
  setOAuthToken: (token: string) => PickerBuilder;
  setDeveloperKey: (key: string) => PickerBuilder;
  setAppId: (appId: string) => PickerBuilder;
  setTitle: (title: string) => PickerBuilder;
  setOrigin: (origin: string) => PickerBuilder;
  setCallback: (cb: (data: PickerResponse) => void) => PickerBuilder;
  build: () => { setVisible: (visible: boolean) => void; dispose?: () => void };
};

type DocsView = {
  setIncludeFolders: (include: boolean) => DocsView;
  setSelectFolderEnabled: (enabled: boolean) => DocsView;
  setMimeTypes: (mimeTypes: string) => DocsView;
  setOwnedByMe: (owned: boolean) => DocsView;
};

type PickerNamespace = {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (viewId?: unknown) => DocsView;
  ViewId: { DOCUMENTS: unknown };
  Action: { PICKED: string; CANCEL: string };
};

type GapiGlobal = {
  load: (
    libraries: string,
    config: { callback: () => void; onerror?: () => void },
  ) => void;
};

/**
 * Reach the two globals the picker scripts install, without augmenting the
 * `Window` interface — `identity.ts` already declares `window.google` for the
 * GIS half, and a second declaration of the same property is a type conflict
 * rather than a merge.
 */
function pickerGlobals(): { gapi?: GapiGlobal; picker?: PickerNamespace } {
  if (typeof window === "undefined") return {};
  const w = window as unknown as {
    gapi?: GapiGlobal;
    google?: { picker?: PickerNamespace };
  };
  return { gapi: w.gapi, picker: w.google?.picker };
}

let loadPromise: Promise<void> | null = null;

/**
 * Load `api.js` and then the `picker` library inside it. Idempotent: several
 * components calling this share one script tag and one in-flight promise, the
 * same way `loadGis()` does next door.
 */
function loadPicker(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("The Google Picker is browser-only"));
  }
  if (pickerGlobals().picker) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    function loadPickerLibrary() {
      const { gapi } = pickerGlobals();
      if (!gapi) {
        reject(new Error("Google API script loaded without gapi"));
        return;
      }
      gapi.load("picker", {
        callback: () => {
          if (pickerGlobals().picker) resolve();
          else reject(new Error("Google Picker library failed to initialise"));
        },
        onerror: () => reject(new Error("Could not load the Google Picker")),
      });
    }

    if (pickerGlobals().gapi) {
      loadPickerLibrary();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GAPI_SRC}"]`,
    );
    if (existing) {
      // Another loader is in flight; wait for it.
      existing.addEventListener("load", loadPickerLibrary, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Could not load the Google Picker")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = GAPI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = loadPickerLibrary;
    script.onerror = () => reject(new Error("Could not load the Google Picker"));
    document.head.appendChild(script);
  }).catch((err) => {
    // A failed load must not poison every later attempt: the member's fallback
    // is to press the button again, and a cached rejected promise would make
    // that impossible until a full page reload.
    loadPromise = null;
    throw err;
  });

  return loadPromise;
}

export type PickedDoc = {
  id: string;
  name: string;
};

/**
 * Open Google's picker and resolve with the chosen document, or `null` if the
 * member closed it without picking. Dismissal is not an error: they changed
 * their mind, which is a thing they are allowed to do.
 *
 * Only Google Docs are selectable, and only one at a time. Every additional
 * file type is another export format and another failure mode, and "read my
 * house manual" is one document.
 */
export async function pickGoogleDoc(opts: {
  token: string;
}): Promise<PickedDoc | null> {
  await loadPicker();
  const { picker } = pickerGlobals();
  if (!picker) throw new Error("Google Picker not available");

  // Belt and braces: the view is the Documents view *and* filtered to the Docs
  // mime type, so neither a Google default nor a folder traversal can smuggle
  // a Sheet into the callback.
  const view = new picker.DocsView(picker.ViewId.DOCUMENTS)
    .setIncludeFolders(false)
    .setSelectFolderEnabled(false)
    .setMimeTypes(GOOGLE_DOC_MIME);

  return new Promise<PickedDoc | null>((resolve, reject) => {
    let settled = false;
    try {
      const built = new picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(opts.token)
        .setDeveloperKey(getPickerApiKey())
        .setAppId(getPickerAppId())
        .setOrigin(window.location.origin)
        .setTitle("Choose a Google Doc")
        .setCallback((data) => {
          if (settled) return;
          if (data.action === picker.Action.PICKED) {
            settled = true;
            const doc = data.docs?.[0];
            if (!doc?.id) {
              resolve(null);
              return;
            }
            resolve({ id: doc.id, name: doc.name ?? "Untitled document" });
          } else if (data.action === picker.Action.CANCEL) {
            settled = true;
            resolve(null);
          }
          // Any other action (notably "loaded") is progress, not an outcome.
        })
        .build();
      built.setVisible(true);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

// --- reading the document ---------------------------------------------------

const EXPORT_BASE = "https://www.googleapis.com/drive/v3/files";

/**
 * Export a Google Doc as plain text.
 *
 * Plain text rather than HTML or Markdown on purpose: the destination is
 * `extractPaste`, which takes prose. Formatting is exactly the thing that
 * pipeline throws away, and every markup character we send is a character of
 * the 24k cap spent on angle brackets.
 */
export async function exportDocText(
  fileId: string,
  token: string,
): Promise<string> {
  const url = `${EXPORT_BASE}/${encodeURIComponent(fileId)}/export?mimeType=text%2Fplain`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = (body?.error?.message as string) ?? "";
    } catch {
      // The export endpoint returns bytes, not JSON, on success; a body that
      // won't parse on the error path is not worth reporting on.
    }
    throw new Error(
      `Could not read that document from Google: ${res.status} ${res.statusText}${
        detail ? `. ${detail}` : ""
      }`,
    );
  }
  return res.text();
}

/**
 * The whole client-side half in one call: consent, pick, export.
 * Resolves `null` when the member dismissed the picker.
 */
export async function connectGoogleDoc(
  requestToken: (opts: { scope: string }) => Promise<{ token: string }>,
): Promise<{ text: string; name: string } | null> {
  // Fail fast and locally if the client id is missing, rather than inside
  // Google's script with a message nobody can act on.
  getGoogleOAuthClientId();
  const { token } = await requestToken({ scope: DOCS_PICKER_SCOPE });
  const doc = await pickGoogleDoc({ token });
  if (!doc) return null;
  const text = await exportDocText(doc.id, token);
  return { text, name: doc.name };
}
