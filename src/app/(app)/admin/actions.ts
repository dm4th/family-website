"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/resend";
import { invitationEmail } from "@/lib/email/invitation-email";
import type { InviteRelation } from "@/lib/db/schema";

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

// Any signed-in member (not a guest). Used by the invite actions, which PRD 24
// opens up from admin-only to all members. RLS on `invitations` is the real
// authority (insert-own, no admin-role unless is_admin); this is the app-layer
// mirror so a guest never even reaches the write.
async function requireMember(): Promise<AdminContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error("Not signed in");
  }
  const { data: isGuest } = await supabase.rpc("is_guest");
  if (isGuest === true) {
    throw new Error("Members only");
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

  // Deactivation is now DB-enforced (PRD 26): the is_active() restrictive RLS
  // policies deny a deactivated user every read/write the moment this stamp
  // lands. Rotating ics_token in the same update kills any leaked calendar-feed
  // URL immediately (belt-and-suspenders with PRD 25, which also rejects a
  // deactivated token in the feed function). Reactivation clears the stamp; the
  // rotated token stays rotated (harmless — the old URL is simply dead).
  const patch: { deactivated_at: string | null; ics_token?: string } = {
    deactivated_at: deactivate ? new Date().toISOString() : null,
  };
  if (deactivate) {
    patch.ics_token = randomUUID();
  }
  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", profileId);
  if (error) throw new Error(error.message);

  // Deactivation must fully lock a user out. is_guest() is activation-agnostic
  // by design (it can't widen access), so a deactivated guest would still see
  // their granted property until the grant is gone — revoke all their grants
  // here. (PRD 15: enforce deactivation separately and bluntly.)
  if (deactivate) {
    await supabase.from("property_guests").delete().eq("profile_id", profileId);

    // Kill any live session at the source so a still-valid access token can't
    // be refreshed. RLS already denies data to the current token; this deletes
    // the user's auth.sessions rows so the logout is permanent within one token
    // lifetime. Admin-guarded SECURITY DEFINER RPC (PRD 26) — best-effort: the
    // RLS gate + middleware redirect are the real guarantee, so a transient
    // failure here must not block the deactivation the admin already committed.
    const { error: revokeError } = await supabase.rpc("revoke_user_sessions", {
      p_user_id: profileId,
    });
    if (revokeError) {
      console.error("revoke_user_sessions failed", revokeError);
    }
  }

  revalidatePath("/admin");
  revalidatePath("/family");
}

// ============================================================================
// Invitations
// ============================================================================

export type InvitationActionState =
  | { status: "idle" }
  | {
      status: "created";
      email: string;
      /** False when the invitation saved but the welcome email didn't go out. */
      emailed: boolean;
    }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

/** Allowed kinship answers, mirroring the DB check constraint (PRD 39). */
const INVITE_RELATIONS: readonly InviteRelation[] = [
  "parent",
  "child",
  "sibling",
  "spouse",
  "other",
];

/**
 * Send the warm invitation email. Best-effort by design: returns whether it
 * went out so the form can tell the inviter the truth, and never throws.
 *
 * The CTA lands on /login with the address prefilled rather than carrying a
 * magic link of its own. Two reasons: an emailed link would be a second,
 * competing sign-in email next to the existing "Email Magic Link" button, and
 * links in forwarded email age badly. Prefilling gets the same result (the one
 * address that works, already typed) without either problem.
 */
async function sendInvitationEmail({
  supabase,
  inviterId,
  invitedEmail,
  isGuest,
  grantPropertyId,
}: {
  supabase: AdminCheckedClient;
  inviterId: string;
  invitedEmail: string;
  isGuest: boolean;
  grantPropertyId: string | null;
}): Promise<boolean> {
  try {
    const { data: inviter } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", inviterId)
      .single();

    let propertyName: string | null = null;
    if (isGuest && grantPropertyId) {
      const { data: property } = await supabase
        .from("properties")
        .select("name")
        .eq("id", grantPropertyId)
        .single();
      propertyName = (property?.name as string | null) ?? null;
    }

    const origin = getOrigin(await headers());
    const rendered = invitationEmail({
      invitedEmail,
      inviterName: (inviter?.full_name as string | null)?.trim() || "",
      acceptUrl: `${origin}/login?email=${encodeURIComponent(invitedEmail)}`,
      isGuest,
      propertyName,
    });

    const result = await sendEmail({
      to: [invitedEmail],
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    return result.ok;
  } catch (err) {
    console.error(
      `[invite] could not send invitation email: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return false;
  }
}

export async function createInvitation(
  _prev: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  try {
    const { supabase, userId } = await requireMember();
    const email = readText(formData, "email")?.toLowerCase() ?? null;
    const role = readText(formData, "role");
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { status: "error", message: "Please enter a valid email." };
    }
    if (!role || !["admin", "member", "guest"].includes(role)) {
      return { status: "error", message: "Pick a role." };
    }

    // Only an admin may invite a new admin (mirrors the invitations RLS check).
    if (role === "admin") {
      const { data: adminCheck } = await supabase.rpc("is_admin");
      if (adminCheck !== true) {
        return {
          status: "error",
          message: "Only an admin can invite a new admin.",
        };
      }
    }

    // Guest invites must carry the property to grant on accept (PRD 15). The
    // grant is materialized by handle_new_user() on first sign-in.
    const grantPropertyId = readText(formData, "grant_property_id");
    if (role === "guest" && !grantPropertyId) {
      return {
        status: "error",
        message: "Pick a property to grant the guest access to.",
      };
    }

    // Optional kinship (PRD 39) — a hint for the invitee's tree step, never an
    // edge. Guests are excluded by design: they aren't family and never see the
    // tree step, so storing a relationship for them would be meaningless.
    const relationRaw = readText(formData, "relation_to_inviter");
    const relationToInviter =
      role !== "guest" &&
      relationRaw &&
      INVITE_RELATIONS.includes(relationRaw as InviteRelation)
        ? (relationRaw as InviteRelation)
        : null;
    const relationNote =
      role !== "guest" ? readText(formData, "relation_note") : null;

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
      grant_property_id: role === "guest" ? grantPropertyId : null,
      relation_to_inviter: relationToInviter,
      relation_note: relationNote,
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

    // The invitation now actually invites (PRD 39). Best-effort, exactly like
    // the booking emails: a send failure must not undo a row that was written
    // successfully, or the inviter sees an error for an invite that exists.
    const emailed = await sendInvitationEmail({
      supabase,
      inviterId: userId,
      invitedEmail: email,
      isGuest: role === "guest",
      grantPropertyId: role === "guest" ? grantPropertyId : null,
    });

    revalidatePath("/admin");
    revalidatePath("/invite");
    return { status: "created", email, emailed };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function revokeInvitation(invitationId: string) {
  // RLS restricts the UPDATE to the inviter or an admin.
  const { supabase } = await requireMember();
  const { error } = await supabase
    .from("invitations")
    .update({ status: "revoked" })
    .eq("id", invitationId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/invite");
}

/**
 * Trigger a magic-link email to the invitee. They don't strictly need this —
 * any sign-in (Google or magic link) will trigger the profile-creation flow
 * that adopts the invitation. But it's the smoothest UX when the family member
 * doesn't already have the family-portal URL in their head.
 */
export async function sendInviteMagicLink(invitationId: string) {
  // RLS on invitations SELECT restricts a member to their own invites.
  const { supabase } = await requireMember();
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
  revalidatePath("/invite");
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
