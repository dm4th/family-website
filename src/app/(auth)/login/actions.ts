"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function getOrigin(headerList: Awaited<ReturnType<typeof headers>>) {
  const envOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  if (envOrigin) return envOrigin.replace(/\/$/, "");

  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  if (!host) throw new Error("Cannot determine request origin");
  return `${proto}://${host}`;
}

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { status: "error", message: "Please enter your email." };
  }

  const supabase = await createClient();
  const headerList = await headers();
  const origin = getOrigin(headerList);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      // Invite-only is enforced by the handle_new_user() trigger (PRD 24): a
      // new email with no pending invitation is rejected at account creation,
      // which for a magic link happens right here at request time.
      shouldCreateUser: true,
    },
  });

  if (error) {
    // An uninvited email surfaces as GoTrue's generic "Database error saving
    // new user" (the trigger raised). Show the family-friendly reason instead
    // of the raw error. Genuine failures fall through to their real message.
    const msg = error.message?.toLowerCase() ?? "";
    const notInvited =
      error.status === 500 ||
      msg.includes("saving new user") ||
      msg.includes("database error");
    if (notInvited) {
      return {
        status: "error",
        message:
          "This email address has not been invited yet. Ask a family member to send an invitation to this address, then try again.",
      };
    }
    return { status: "error", message: error.message };
  }

  return { status: "sent", email };
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const headerList = await headers();
  const origin = getOrigin(headerList);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error || !data.url) {
    redirect(`/login?error=${encodeURIComponent(error?.message ?? "oauth")}`);
  }

  redirect(data.url);
}
