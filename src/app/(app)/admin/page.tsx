import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { BriefingPanel, PageIntro } from "@/components/shell";
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

  const { data: pendingBookings } = await supabase
    .from("bookings")
    .select(
      `id, start_date, end_date, guest_count, notes,
       properties:property_id ( slug, name ),
       profiles:requested_by ( full_name, email )`,
    )
    .eq("status", "pending")
    .order("start_date", { ascending: true });

  return (
    <div className="flex flex-col gap-12">
      <PageIntro
        mode="advisory"
        eyebrow="Governance"
        title="Admin"
        context="Family roster, invitations, and properties registry."
      />

      <BriefingPanel>
        <Section
          title="Members"
          description="Change roles, deactivate accounts. You can't edit your own role here."
        >
          <MembersSection
            members={(members ?? []).map((m) => ({
              id: m.id,
              full_name: m.full_name,
              email: m.email,
              role: m.role as "admin" | "member" | "guest",
              family_branch: m.family_branch,
              generation: m.generation,
              deactivated_at: m.deactivated_at,
            }))}
            currentUserId={user.id}
          />
        </Section>
      </BriefingPanel>

      <BriefingPanel>
        <Section
          title="Invitations"
          description="Create an invitation, then either share the portal URL or click 'Email magic link' to send them a sign-in email. The role is applied automatically on first sign-in."
        >
          <InvitationsSection
            invitations={(invitations ?? []).map((i) => ({
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
            }))}
          />
        </Section>
      </BriefingPanel>

      <BriefingPanel>
        <Section
          title="Properties"
          description="Add new properties and change their status. Any family member can edit the content; admins control existence."
        >
          <PropertiesSection
            properties={(properties ?? []).map((p) => ({
              id: p.id,
              slug: p.slug,
              name: p.name,
              location: p.location,
              status: p.status as "active" | "maintenance" | "inactive",
            }))}
          />
        </Section>
      </BriefingPanel>

      <BriefingPanel>
        <Section
          title="Pending Bookings"
          description="Approve or decline from each property's calendar. Links below open the request in context."
        >
          {!pendingBookings || pendingBookings.length === 0 ? (
            <p className="text-sm italic text-foreground-subtle">
              Nothing waiting. The queue is clear.
            </p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {pendingBookings.map((b) => {
                const prop = Array.isArray(b.properties)
                  ? b.properties[0]
                  : b.properties;
                const prof = Array.isArray(b.profiles)
                  ? b.profiles[0]
                  : b.profiles;
                return (
                  <li
                    key={b.id}
                    className="flex flex-wrap items-baseline justify-between gap-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground">
                        {prop?.name ?? "—"}{" "}
                        <span className="text-foreground-subtle">
                          · {b.start_date} → {b.end_date}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-foreground-subtle">
                        {prof?.full_name ?? prof?.email ?? "Unknown"} ·{" "}
                        {b.guest_count} guest{b.guest_count === 1 ? "" : "s"}
                      </p>
                      {b.notes && (
                        <p className="mt-1 text-xs italic text-foreground-muted">
                          {b.notes}
                        </p>
                      )}
                    </div>
                    {prop?.slug && (
                      <Link
                        href={`/properties/${prop.slug}/calendar`}
                        className="text-sm text-foreground underline-offset-4 hover:underline"
                      >
                        Review →
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </BriefingPanel>
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
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <p className="eyebrow text-accent-bronze">Section</p>
        <h2 className="font-display text-2xl leading-tight text-foreground">
          {title}
        </h2>
        <p className="max-w-prose text-sm text-foreground-muted">
          {description}
        </p>
      </header>
      {children}
    </section>
  );
}
