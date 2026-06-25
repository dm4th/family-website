import { headers } from "next/headers";

/**
 * Calendar-subscription links for one ICS feed scope, derived from a member's
 * secret token. All three point at the same `/api/ics/[scope]?token=…` feed;
 * they differ only in how a given client wants to consume it.
 */
export type IcsFeedLinks = {
  /** Raw https feed URL — copy/paste into any "subscribe by URL" field. */
  https: string;
  /** webcal:// variant — opens the subscribe dialog in Apple Calendar / Outlook. */
  webcal: string;
  /** Deep link into Google Calendar's "add by URL" settings, pre-filled. */
  google: string;
};

/**
 * Build the subscription links for `scope` (a property slug, "me", or "all")
 * authorized by `token`. `baseUrl` is the site origin, e.g.
 * "https://mathiesonfamily.app" (trailing slash tolerated).
 */
export function buildIcsFeedLinks(
  baseUrl: string,
  scope: string,
  token: string,
): IcsFeedLinks {
  const origin = baseUrl.replace(/\/+$/, "");
  const https = `${origin}/api/ics/${encodeURIComponent(scope)}?token=${token}`;
  const webcal = https.replace(/^https?:\/\//, "webcal://");
  // Google fetches the feed server-side over https, so hand it the https URL.
  const google = `https://calendar.google.com/calendar/u/0/r/settings/addbyurl?url=${encodeURIComponent(
    https,
  )}`;
  return { https, webcal, google };
}

/**
 * Resolve the public site origin for building absolute feed URLs. Prefers the
 * configured NEXT_PUBLIC_SITE_URL; falls back to the forwarded request host so
 * preview deployments and local dev produce working links too. Server-only
 * (reads request headers).
 */
export async function getSiteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}
