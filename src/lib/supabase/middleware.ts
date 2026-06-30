import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicKey, getSupabaseUrl } from "./env";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabasePublicKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the auth session if needed. Do not run other Supabase
  // queries between createServerClient and getUser — see @supabase/ssr docs.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicPath =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    // ICS calendar feeds authorize via a per-member `?token=`, not the session
    // cookie, so external calendar pollers (Google/Apple) can reach them. The
    // route itself returns 401 without a valid token. Nothing else under /api
    // is exempted.
    pathname.startsWith("/api/ics/") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Guest route gating (PRD 15, defense layer 2 — UX + early block). RLS is the
  // real guarantee; this just keeps a guest from ever seeing a forbidden shell.
  // The role lookup runs AFTER getUser() returns, never between it and
  // createServerClient (see the @supabase/ssr note above).
  if (user && !isPublicPath) {
    const { data: isGuest } = await supabase.rpc("is_guest");
    if (isGuest === true && !isGuestAllowedPath(pathname)) {
      const url = request.nextUrl.clone();
      // Land them on /properties — that page does the 0 / 1 / 2+ routing and is
      // itself RLS-scoped to only their granted properties.
      url.pathname = "/properties";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

// Top-level routes a guest may reach. Everything else (/, /family, /admin,
// /calendar, /photos, /coming-soon, …) bounces to /properties. Per-property
// authorization is enforced again by RLS + the page's can_view_property gate,
// so a granted-properties prefix here is safe even for non-granted slugs.
function isGuestAllowedPath(pathname: string): boolean {
  return (
    pathname === "/properties" ||
    pathname.startsWith("/properties/") ||
    pathname === "/profile" ||
    pathname.startsWith("/profile/") ||
    pathname.startsWith("/sign-out")
  );
}
