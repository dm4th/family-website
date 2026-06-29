"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type AdminCheckedClient = Awaited<ReturnType<typeof createClient>>;

type AdminContext = {
  supabase: AdminCheckedClient;
  userId: string;
};

async function requireAdmin(): Promise<AdminContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error("Not signed in");
  }
  const { data: adminCheck } = await supabase.rpc("is_admin");
  if (adminCheck !== true) {
    throw new Error("Admin only");
  }
  return { supabase, userId: user.id };
}

function readText(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function getOrigin(headerList: Awaited<ReturnType<typeof headers>>) {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  if (!host) throw new Error("Cannot determine site origin");
  return `${proto}://${host}`;
}

// ============================================================================
// Members
// ============================================================================

export type MemberActionState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; message: string };

export async function changeMemberRole(
  profileId: string,
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  try {
    const { supabase } = await requireAdmin();
    const role = readText(formData, "role");
    if (!role || !["admin", "member", "guest"].includes(role)) {
      return { status: "error", message: "Invalid role" };
    }
    const { error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", profileId);
    if (error) return { status: "error", message: error.message };
    revalidatePath("/admin");
    revalidatePath("/family");
    revalidatePath(`/family/${profileId}`);
    return { status: "saved" };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function setMemberActivation(
  profileId: string,
  deactivate: boolean,
) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("profiles")
    .update({ deactivated_at: deactivate ? new Date().toISOString() : null })
    .eq("id", profileId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/family");
}

// ============================================================================
// Invitations
// ============================================================================

export type InvitationActionState =
  | { status: "idle" }
  | { status: "created"; email: string }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

export async function createInvitation(
  _prev: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  try {
    const { supabase, userId } = await requireAdmin();
    const email = readText(formData, "email")?.toLowerCase() ?? null;
    const role = readText(formData, "role");
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { status: "error", message: "Please enter a valid email." };
    }
    if (!role || !["admin", "member", "guest"].includes(role)) {
      return { status: "error", message: "Pick a role." };
    }

    // 30-day expiry default.
    const expiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { error } = await supabase.from("invitations").insert({
      email,
      role,
      invited_by: userId,
      status: "pending",
      token: randomUUID(),
      expires_at: expiresAt,
    });
    if (error) {
      // Surface the unique-pending-per-email collision nicely.
      if (/duplicate key/i.test(error.message)) {
        return {
          status: "error",
          message: `There is already a pending invitation for ${email}.`,
        };
      }
      return { status: "error", message: error.message };
    }
    revalidatePath("/admin");
    return { status: "created", email };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function revokeInvitation(invitationId: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("invitations")
    .update({ status: "revoked" })
    .eq("id", invitationId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

/**
 * Trigger a magic-link email to the invitee. They don't strictly need this —
 * any sign-in (Google or magic link) will trigger the profile-creation flow
 * that adopts the invitation. But it's the smoothest UX when the family member
 * doesn't already have the family-portal URL in their head.
 */
export async function sendInviteMagicLink(invitationId: string) {
  const { supabase } = await requireAdmin();
  const { data: invitation, error } = await supabase
    .from("invitations")
    .select("email, status")
    .eq("id", invitationId)
    .single();
  if (error || !invitation) throw new Error("Invitation not found");
  if (invitation.status !== "pending") {
    throw new Error(`Cannot send: invitation is ${invitation.status}`);
  }

  const headerList = await headers();
  const origin = getOrigin(headerList);

  const { error: otpErr } = await supabase.auth.signInWithOtp({
    email: invitation.email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      shouldCreateUser: true,
    },
  });
  if (otpErr) throw new Error(otpErr.message);

  revalidatePath("/admin");
}

// ============================================================================
// Properties (admin-only ops)
// ============================================================================

export type PropertyAdminState =
  | { status: "idle" }
  | { status: "created"; slug: string }
  | { status: "error"; message: string };

export async function createProperty(
  _prev: PropertyAdminState,
  formData: FormData,
): Promise<PropertyAdminState> {
  try {
    const { supabase } = await requireAdmin();
    const name = readText(formData, "name");
    if (!name) return { status: "error", message: "Name is required." };
    const explicitSlug = readText(formData, "slug");
    const slug = explicitSlug ?? slugify(name);
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return {
        status: "error",
        message:
          "Slug must use lowercase letters, numbers, and hyphens only.",
      };
    }
    const location = readText(formData, "location");

    const { error } = await supabase
      .from("properties")
      .insert({ slug, name, location });
    if (error) {
      if (/duplicate key/i.test(error.message)) {
        return {
          status: "error",
          message: `A property with slug "${slug}" already exists.`,
        };
      }
      return { status: "error", message: error.message };
    }
    revalidatePath("/admin");
    revalidatePath("/properties");
    return { status: "created", slug };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function setPropertyStatus(
  propertyId: string,
  status: "active" | "maintenance" | "inactive",
) {
  // Site admin OR property admin can flip status. We don't go through
  // requireAdmin() because property admins aren't site admins.
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Not signed in");

  const { data: siteAdmin } = await supabase.rpc("is_admin");
  let allowed = siteAdmin === true;
  if (!allowed) {
    const { data: propAdmin } = await supabase.rpc("is_property_admin", {
      p_property_id: propertyId,
    });
    allowed = propAdmin === true;
  }
  if (!allowed) {
    throw new Error("Not authorized to change this property's status");
  }

  const { error } = await supabase
    .from("properties")
    .update({ status })
    .eq("id", propertyId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/properties");
}
