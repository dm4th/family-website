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

  return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/"}`);
}
