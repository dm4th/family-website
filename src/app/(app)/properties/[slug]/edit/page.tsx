import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canManageProperty } from "@/lib/property-auth";
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

  const { data: property, error } = await supabase
    .from("properties")
    .select(
      "id, slug, name, location, address, description, how_to, guidelines, amenities, status",
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

  const admins =
    (currentAdmins ?? []).flatMap((row) => {
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
    .map((m) => ({
      id: m.id,
      fullName: m.full_name,
      email: m.email,
    }));

  return (
    <div className="space-y-12">
      <div className="space-y-1">
        <div className="text-sm">
          <Link
            href={`/properties/${property.slug}`}
            className="text-muted-foreground hover:text-foreground"
          >
            ← Back to {property.name}
          </Link>
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Edit {property.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Any family member can edit. Every change is recorded.
        </p>
      </div>

      <section className="max-w-2xl space-y-4">
        <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground">
          Details
        </h2>
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
          }}
          canChangeStatus={canManage}
        />
      </section>

      {(canManage || admins.length > 0) && (
        <section className="max-w-2xl space-y-4">
          <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground">
            Property admins
          </h2>
          <p className="text-sm text-muted-foreground">
            Property admins can change this property&apos;s status alongside
            site admins. {isSiteAdmin ? "" : "Only site admins or this property's existing admins can manage this list."}
          </p>
          <PropertyAdminsEditor
            propertyId={property.id}
            propertySlug={property.slug}
            admins={admins}
            candidates={candidates}
            canManage={canManage}
          />
        </section>
      )}

      <section className="max-w-2xl space-y-4">
        <h2 className="text-base font-semibold uppercase tracking-wide text-muted-foreground">
          Contacts
        </h2>
        <ContactsEditor
          propertyId={property.id}
          propertySlug={property.slug}
          contacts={
            (contacts ?? []).map((c) => ({
              id: c.id,
              label: c.label,
              name: c.name,
              phone: c.phone,
              email: c.email,
              notes: c.notes,
            }))
          }
        />
      </section>
    </div>
  );
}
