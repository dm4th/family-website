import type { NextConfig } from "next";

// --- Security headers (PRD 28) -------------------------------------------
//
// CSP ships in REPORT-ONLY mode first: violations show up in the browser
// console / reporting API without breaking the page. After a clean window
// against the live app, flip `CSP_REPORT_ONLY` to false to enforce.
//
// The allowlist is derived from the app's actual external surface:
//   - Supabase (auth REST, PostgREST, Storage signed URLs, Realtime wss)
//   - Google Identity Services script + popup/iframe (accounts.google.com)
//   - Google Photos Picker REST (photospicker.googleapis.com)
//   - Google user-content CDN (*.googleusercontent.com): Picker photo bytes
//     (fetch) and Google-account avatar URLs copied at signup (img)
// Resend is server-side only and needs no browser origin. Fonts are
// self-hosted by next/font. If a future integration adds a browser-side
// origin, extend the matching directive here and record it in PRD 28.

const CSP_REPORT_ONLY = true;

const isDev = process.env.NODE_ENV === "development";

// next.config is evaluated after @next/env loads .env files, so the
// project URL is available here in dev and on Vercel. Fall back to the
// wildcard so a missing env var degrades to a looser policy, not a broken
// site (env.ts throws at runtime for the truly-missing case).
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
  } catch {
    return "*.supabase.co";
  }
})();

const csp = [
  `default-src 'self'`,
  // 'unsafe-inline' is required until nonces are threaded through proxy.ts
  // (Next injects inline bootstrap scripts; next-themes injects the
  // anti-flash snippet). 'unsafe-eval' is dev-only (React error overlay).
  // Tightening script-src to nonces is the recorded follow-up for the
  // enforce phase — see PRD 28 Implementation notes.
  // apis.google.com serves gapi + the Picker library (PRD 38).
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://accounts.google.com https://apis.google.com`,
  // Next/React set inline style attributes; no external stylesheets.
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' blob: data: https://${supabaseHost} https://*.googleusercontent.com`,
  // www.googleapis.com is the Drive export the Google Doc door reads (PRD 38);
  // apis.google.com is the Picker's own XHR back to Google.
  `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://accounts.google.com https://apis.google.com https://www.googleapis.com https://photospicker.googleapis.com https://*.googleusercontent.com`,
  `font-src 'self'`,
  // The Google Picker renders inside an iframe served from docs.google.com,
  // with apis.google.com hosting the shim that talks to it (PRD 38).
  `frame-src https://accounts.google.com https://docs.google.com https://apis.google.com`,
  `object-src 'none'`,
  `base-uri 'self'`,
  // Chrome checks form-action against the whole redirect chain of a form
  // POST. "Continue with Google" is a server action that 303s to Supabase's
  // /auth/v1/authorize, which bounces to accounts.google.com — both must be
  // allowed or enforcement breaks Google sign-in.
  `form-action 'self' https://${supabaseHost} https://accounts.google.com`,
  `frame-ancestors 'none'`,
  ...(isDev ? [] : [`upgrade-insecure-requests`]),
].join("; ");

const securityHeaders = [
  {
    key: CSP_REPORT_ONLY
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy",
    value: csp,
  },
  // Redundant with frame-ancestors 'none' but kept for older UA coverage.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera stays available to the app itself (mobile photo capture uses
  // native file inputs today, but don't foreclose getUserMedia); mic and
  // geolocation have no use case.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  // HSTS only where HTTPS is guaranteed (Vercel prod); a dev localhost
  // must never be pinned to HTTPS.
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]),
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
