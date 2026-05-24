import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withSignedUrls } from "@/lib/photos";
import { Markdown } from "@/components/markdown";
import { PhotoUpload } from "@/components/photo-upload";
import { PropertyGallery } from "./property-gallery";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export default async function PropertyDetailPage({
  params,
}: {
  params: Params;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: property, error } = await supabase
    .from("properties")
    .select(
      "id, slug, name, location, address, description, how_to, guidelines, amenities, status, updated_at, updated_by",
    )
    .eq("slug", slug)
    .single();
  if (error || !property) notFound();

  // Photos attached to this property, newest first.
  const { data: photoRows } = await supabase
    .from("photos")
    .select("id, storage_path, caption, uploaded_by, created_at")
    .eq("property_id", property.id)
    .order("created_at", { ascending: false });

  const signedPhotos = await withSignedUrls(
    (photoRows ?? []).map((p) => ({
      id: p.id,
      storagePath: p.storage_path,
      caption: p.caption,
      uploadedBy: p.uploaded_by,
    })),
  );

  // Contacts in display order.
  const { data: contacts } = await supabase
    .from("property_contacts")
    .select("id, label, name, phone, email, notes, sort_order")
    .eq("property_id", property.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-10">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            {property.name}
          </h1>
          {property.location && (
            <p className="text-muted-foreground">{property.location}</p>
          )}
          {property.address && (
            <p className="text-sm text-muted-foreground">{property.address}</p>
          )}
        </div>
        <Link
          href={`/properties/${property.slug}/edit`}
          className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Edit
        </Link>
      </div>

      {property.status !== "active" && (
        <div className="rounded-md border border-amber-500/30 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          This property is currently <strong>{property.status}</strong>.
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">About</h2>
        <Markdown source={property.description} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          How things work here
        </h2>
        <Markdown source={property.how_to} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">House rules</h2>
        <Markdown source={property.guidelines} />
      </section>

      {property.amenities && property.amenities.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Amenities</h2>
          <ul className="flex flex-wrap gap-2">
            {property.amenities.map((a: string) => (
              <li
                key={a}
                className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs"
              >
                {a}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Contacts</h2>
        {!contacts || contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No contacts saved yet. Add caretakers, plumbers, emergency numbers
            from the{" "}
            <Link
              href={`/properties/${property.slug}/edit`}
              className="underline"
            >
              edit page
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {contacts.map((c) => (
              <li key={c.id} className="px-3 py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="space-x-2">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {c.label}
                    </span>
                    {c.name && (
                      <span className="font-medium">{c.name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {c.phone}
                      </a>
                    )}
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {c.email}
                      </a>
                    )}
                  </div>
                </div>
                {c.notes && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.notes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Photos</h2>
          <p className="text-xs text-muted-foreground">
            Anyone in the family can add to this gallery.
          </p>
        </div>

        <PhotoUpload
          attachment={{ kind: "property", propertyId: property.id }}
        />

        <PropertyGallery photos={signedPhotos} />
      </section>
    </div>
  );
}
