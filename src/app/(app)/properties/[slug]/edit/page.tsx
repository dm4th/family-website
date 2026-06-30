import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { canManageProperty } from "@/lib/property-auth";
import { resolveViewer } from "@/lib/guest";
import { LedgerPanel, PageIntro } from "@/components/shell";
import { PropertyEditForm } from "./property-edit-form";
import { ContactsEditor } from "./contacts-editor";
import { PropertyAdminsEditor } from "./property-admins-editor";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export default async function PropertyEditPage({
  params,
}: {
  params: Params;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  // Editing is members/admins only. A granted guest can READ this property, so
  // RLS alone wouldn't 404 them here — block explicitly. (Writes are also
  // RLS-guarded, but a guest should never see the edit shell.)
  const viewer = await resolveViewer();
  if (viewer?.isGuest) notFound();

  const { data: property, error } = await supabase
    .from("properties")
    .select(
      "id, slug, name, location, address, description, how_to, guidelines, amenities, status, max_guests, peak_period_ranges",
    )
    .eq("slug", slug)
    .single();
  if (error || !property) notFound();

  const { ok: canManage, isSiteAdmin } = await canManageProperty(property.id);

  const { data: contacts } = await supabase
    .from("property_contacts")
    .select("id, label, name, phone, email, notes, sort_order")
    .eq("property_id", property.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  // Property admins + eligible candidates for the admin picker.
  const [{ data: currentAdmins }, { data: allMembers }] = await Promise.all([
    supabase
      .from("property_admins")
      .select("profile_id, granted_at, profiles!inner(id, full_name, email)")
      .eq("property_id", property.id),
    canManage
      ? supabase
          .from("profiles")
          .select("id, full_name, email")
          .is("deactivated_at", null)
          .order("full_name", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const admins = (currentAdmins ?? []).flatMap((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    if (!profile) return [];
    return [
      {
        profileId: profile.id,
        fullName: profile.full_name,
        email: profile.email,
      },
    ];
  });

  const adminIds = new Set(admins.map((a) => a.profileId));
  const candidates = (allMembers ?? [])
    .filter((m) => !adminIds.has(m.id))
    .map((m) => ({ id: m.id, fullName: m.full_name, email: m.email }));

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-1">
        <Link
          href={`/properties/${property.slug}`}
          className="text-sm text-foreground-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Back to {property.name}
        </Link>
      </div>

      <PageIntro
        mode="operations"
        eyebrow="Edit"
        title={property.name}
        context="Any family member can edit. Every change is recorded in the revision log."
      />

      <LedgerPanel className="max-w-3xl">
        <header className="mb-6 flex flex-col gap-1">
          <h2 className="font-display text-xl leading-tight text-foreground">
            Details
          </h2>
          <p className="text-xs text-foreground-subtle">
            Description, house rules, and operating notes.
          </p>
        </header>
        <PropertyEditForm
          property={{
            id: property.id,
            name: property.name,
            location: property.location,
            address: property.address,
            description: property.description,
            how_to: property.how_to,
            guidelines: property.guidelines,
            amenities: property.amenities ?? [],
            status: property.status,
            max_guests: property.max_guests ?? null,
            peak_period_ranges:
              (property.peak_period_ranges ?? []) as {
                start: string;
                end: string;
              }[],
          }}
          canChangeStatus={canManage}
        />
      </LedgerPanel>

      {(canManage || admins.length > 0) && (
        <LedgerPanel className="max-w-3xl">
          <header className="mb-6 flex flex-col gap-1">
            <h2 className="font-display text-xl leading-tight text-foreground">
              Property admins
            </h2>
            <p className="text-xs text-foreground-subtle">
              Property admins can change this property&apos;s status alongside
              site admins.{" "}
              {isSiteAdmin
                ? ""
                : "Only site admins or this property's existing admins can manage this list."}
            </p>
          </header>
          <PropertyAdminsEditor
            propertyId={property.id}
            propertySlug={property.slug}
            admins={admins}
            candidates={candidates}
            canManage={canManage}
          />
        </LedgerPanel>
      )}

      <LedgerPanel className="max-w-3xl">
        <header className="mb-6 flex flex-col gap-1">
          <h2 className="font-display text-xl leading-tight text-foreground">
            Contacts
          </h2>
          <p className="text-xs text-foreground-subtle">
            Caretakers, vendors, emergency numbers.
          </p>
        </header>
        <ContactsEditor
          propertyId={property.id}
          propertySlug={property.slug}
          contacts={(contacts ?? []).map((c) => ({
            id: c.id,
            label: c.label,
            name: c.name,
            phone: c.phone,
            email: c.email,
            notes: c.notes,
          }))}
        />
      </LedgerPanel>
    </div>
  );
}
