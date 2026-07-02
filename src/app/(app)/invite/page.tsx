import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { createClient } from "@/lib/supabase/server";
import { resolveViewer } from "@/lib/guest";
import { PageIntro, SalonPanel } from "@/components/shell";
import {
  InvitationsSection,
  type InvitationRow,
} from "../admin/invitations-section";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invite Someone",
};

/**
 * Member-facing invite page (PRD 24, slice 2). Any family member can invite a
 * new member, or a guest scoped to a property. Guests can't invite (bounced).
 * Admins may also invite a new admin; the full-roster view stays on /admin.
 * The invite + revoke actions are RLS-guarded (insert-own, revoke-own-or-admin).
 */
export default async function InvitePage() {
  const viewer = await resolveViewer();
  if (!viewer || viewer.isGuest) notFound();

  const supabase = await createClient();

  // Just the invitations this member has sent (RLS also restricts this).
  const { data: invitations } = await supabase
    .from("invitations")
    .select("id, email, role, status, expires_at, created_at")
    .eq("invited_by", viewer.userId)
    .order("created_at", { ascending: false });

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, status")
    .order("name");

  const rows: InvitationRow[] = (invitations ?? []).map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role as InvitationRow["role"],
    status: i.status as InvitationRow["status"],
    expires_at: i.expires_at,
    created_at: i.created_at,
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <PageIntro
        mode="family"
        eyebrow="Family"
        title="Invite Someone"
        context="Bring a family member into the site, or give a guest access to one of the homes. They sign in with the email you invite, using the same magic link everyone uses."
      />
      <SalonPanel>
        <InvitationsSection
          invitations={rows}
          properties={(properties ?? [])
            .filter((p) => p.status !== "inactive")
            .map((p) => ({ id: p.id, name: p.name }))}
          isAdmin={viewer.isAdmin}
          listTitle="Invitations you've sent"
        />
      </SalonPanel>
    </div>
  );
}
