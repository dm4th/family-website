import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // An uninvited sign-in (PRD 24) fails here: handle_new_user() raised, so
    // GoTrue could not create the user and surfaces a generic "Database error
    // saving new user" (500). Route those to the calm invite-only page; genuine
    // link problems (expired/invalid) go back to sign-in with the message.
    const msg = error.message?.toLowerCase() ?? "";
    const rejectedSignup =
      error.status === 500 ||
      msg.includes("saving new user") ||
      msg.includes("database error");
    if (rejectedSignup) {
      return NextResponse.redirect(`${origin}/no-invite`);
    }
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Re-login block (PRD 26): a deactivated account still exists, so its owner
  // can request a fresh magic link and exchange it into a session here. Catch
  // that immediately — sign the new session back out and land them on the calm
  // /deactivated page rather than letting the middleware bounce a live-but-
  // useless session. is_active() returns false for a deactivated profile; only
  // block on an explicit false so a transient RPC error doesn't strand a valid
  // sign-in (the middleware gate + RLS would still catch a genuine one).
  const { data: isActive } = await supabase.rpc("is_active");
  if (isActive === false) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/deactivated`);
  }

  return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/"}`);
}
