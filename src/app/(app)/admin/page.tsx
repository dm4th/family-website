import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MembersSection } from "./members-section";
import { InvitationsSection } from "./invitations-section";
import { PropertiesSection } from "./properties-section";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: adminCheck } = await supabase.rpc("is_admin");
  if (adminCheck !== true) {
    // Don't even acknowledge the page exists for non-admins.
    notFound();
  }

  const { data: members } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, role, family_branch, generation, deactivated_at",
    )
    .order("deactivated_at", { ascending: true, nullsFirst: true })
    .order("full_name", { ascending: true });

  const { data: invitations } = await supabase
    .from("invitations")
    .select("id, email, role, status, expires_at, created_at")
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });

  const { data: properties } = await supabase
    .from("properties")
    .select("id, slug, name, location, status")
    .order("status", { ascending: true })
    .order("name", { ascending: true });

  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Admin
        </h1>
        <p className="text-muted-foreground mt-1">
          Family roster, invitations, and properties.
        </p>
      </div>

      <Section
        title="Members"
        description="Change roles, deactivate accounts. You can't edit your own role here."
      >
        <MembersSection
          members={
            (members ?? []).map((m) => ({
              id: m.id,
              full_name: m.full_name,
              email: m.email,
              role: m.role as "admin" | "member" | "guest",
              family_branch: m.family_branch,
              generation: m.generation,
              deactivated_at: m.deactivated_at,
            }))
          }
          currentUserId={user.id}
        />
      </Section>

      <Section
        title="Invitations"
        description="Create an invitation, then either share the portal URL or click 'Email magic link' to send them a sign-in email. The role is applied automatically on first sign-in."
      >
        <InvitationsSection
          invitations={
            (invitations ?? []).map((i) => ({
              id: i.id,
              email: i.email,
              role: i.role as "admin" | "member" | "guest",
              status: i.status as
                | "pending"
                | "accepted"
                | "expired"
                | "revoked",
              expires_at: i.expires_at,
              created_at: i.created_at,
            }))
          }
        />
      </Section>

      <Section
        title="Properties"
        description="Add new properties and change their status. Any family member can edit the content; admins control existence."
      >
        <PropertiesSection
          properties={
            (properties ?? []).map((p) => ({
              id: p.id,
              slug: p.slug,
              name: p.name,
              location: p.location,
              status: p.status as "active" | "maintenance" | "inactive",
            }))
          }
        />
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}
