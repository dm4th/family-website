// Browser-only wrapper for Google Identity Services (GIS) token requests.
//
// We use GIS in "token client" mode so we get a short-lived OAuth access
// token (~1hr) in memory without needing a server-side redirect handler.
// The token is then used by the Picker REST clients to create a session
// and download bytes from `baseUrl`.
//
// Loading the script is idempotent: multiple components calling
// `requestAccessToken()` share a single <script> tag.

const GIS_SRC = "https://accounts.google.com/gsi/client";

// Minimal subset of the GIS token-client surface we use. The real types
// live in @types/google.accounts which we'd rather not pull in for a
// single function.
type TokenResponse = {
  access_token: string;
  expires_in: number;
  scope: string;
  error?: string;
  error_description?: string;
};

type TokenClient = {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
  callback: (resp: TokenResponse) => void;
};

type GisOauth2 = {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (resp: TokenResponse) => void;
    error_callback?: (err: { type?: string; message?: string }) => void;
  }) => TokenClient;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: GisOauth2;
      };
    };
  }
}

let loadPromise: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Identity Services is browser-only"));
  }
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SRC}"]`,
    );
    if (existing) {
      // Another loader is in flight; wait for it.
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load Google Identity Services")),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function getGoogleOAuthClientId(): string {
  const id = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
  if (!id) {
    throw new Error(
      "NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID is not configured. " +
        "See prds/05-file-uploads.md §Pre-flight.",
    );
  }
  return id;
}

export type AccessToken = {
  token: string;
  /** Wall-clock epoch ms at which the token expires. */
  expiresAt: number;
  /** Scopes Google actually granted (space-separated string). */
  scope: string;
};

/**
 * Open Google's consent popup and resolve with an OAuth access token for
 * the requested scope. Always prompts the user to confirm — that's the
 * point of the Picker UX (per-pick consent).
 */
export async function requestAccessToken(opts: {
  scope: string;
}): Promise<AccessToken> {
  await loadGis();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error("Google Identity Services not available");
  }

  return new Promise<AccessToken>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: getGoogleOAuthClientId(),
      scope: opts.scope,
      callback: (resp) => {
        if (resp.error) {
          reject(
            new Error(
              resp.error_description ??
                resp.error ??
                "Could not get Google access token",
            ),
          );
          return;
        }
        resolve({
          token: resp.access_token,
          expiresAt: Date.now() + resp.expires_in * 1000,
          scope: resp.scope,
        });
      },
      error_callback: (err) => {
        reject(new Error(err.message ?? err.type ?? "Google sign-in failed"));
      },
    });
    // `consent` ensures the user sees the scope dialog even if they've
    // granted it before — important for a Picker flow where consent is
    // the user-facing affordance.
    client.requestAccessToken({ prompt: "consent" });
  });
}
