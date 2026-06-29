"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ============================================================================
// Member-facing guest grants (PRD 15 §4).
//
// "Any member can grant a guest access to a property" — wiki-style, the same
// trust boundary as editing a property. Guests can never grant (the RLS insert
// policy on property_guests already blocks `is_guest()`; we also gate here for
// a clean error + so the deferred-invite path never runs for a guest caller).
// ============================================================================

type MemberContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
};

/** Signed in AND not a guest (member or admin). */
async function requireMember(): Promise<MemberContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Not signed in");
  const { data: isGuest } = await supabase.rpc("is_guest");
  if (isGuest === true) {
    throw new Error("Guests cannot grant access");
  }
  return { supabase, userId: user.id };
}

function getOrigin(headerList: Awaited<ReturnType<typeof headers>>) {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  if (!host) throw new Error("Cannot determine site origin");
  return `${proto}://${host}`;
}

export type GrantGuestState =
  | { status: "idle" }
  | { status: "granted"; email: string }
  | { status: "invited"; email: string }
  | { status: "error"; message: string };

/**
 * Grant a guest read access to one property by email.
 *  - If a profile already exists for that email → create the property_guests
 *    row immediately (no re-invite).
 *  - Otherwise → create a guest invitation carrying this property and email a
 *    magic link; handle_new_user() materializes the grant on first sign-in.
 */
export async function grantGuestAccess(
  propertyId: string,
  slug: string,
  _prev: GrantGuestState,
  formData: FormData,
): Promise<GrantGuestState> {
  try {
    const { supabase, userId } = await requireMember();

    const raw = formData.get("email");
    const email =
      typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { status: "error", message: "Please enter a valid email." };
    }

    // Does this email already have a profile?
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase.from("property_guests").insert({
        property_id: propertyId,
        profile_id: existing.id,
        granted_by: userId,
      });
      if (error) {
        if (/duplicate key/i.test(error.message)) {
          return {
            status: "error",
            message: `${email} already has access to this property.`,
          };
        }
        return { status: "error", message: error.message };
      }
      revalidatePath(`/properties/${slug}`);
      return { status: "granted", email };
    }

    // No profile yet → guest invitation carrying the property grant.
    const expiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { error: invErr } = await supabase.from("invitations").insert({
      email,
      role: "guest",
      invited_by: userId,
      status: "pending",
      token: randomUUID(),
      expires_at: expiresAt,
      grant_property_id: propertyId,
    });
    if (invErr) {
      if (/duplicate key/i.test(invErr.message)) {
        return {
          status: "error",
          message: `There is already a pending invitation for ${email}.`,
        };
      }
      return { status: "error", message: invErr.message };
    }

    // Best-effort magic link — they can also just sign in normally.
    const headerList = await headers();
    const origin = getOrigin(headerList);
    await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
        shouldCreateUser: true,
      },
    });

    revalidatePath(`/properties/${slug}`);
    return { status: "invited", email };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/** Revoke a guest's access to a property. Any member/admin may revoke. */
export async function revokeGuestAccess(
  propertyId: string,
  profileId: string,
  slug: string,
) {
  const { supabase } = await requireMember();
  const { error } = await supabase
    .from("property_guests")
    .delete()
    .eq("property_id", propertyId)
    .eq("profile_id", profileId);
  if (error) throw new Error(error.message);
  revalidatePath(`/properties/${slug}`);
}
