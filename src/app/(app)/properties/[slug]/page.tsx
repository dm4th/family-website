import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { withSignedUrls } from "@/lib/photos";
import { Markdown } from "@/components/markdown";
import { PhotoUpload } from "@/components/photo-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Eyebrow,
  LedgerPanel,
  PageIntro,
  SectionRule,
  StatLine,
  StatRow,
} from "@/components/shell";
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

  const heroPhoto = signedPhotos[0];
  const restPhotos = signedPhotos.slice(1);
  const amenities = (property.amenities ?? []) as string[];

  return (
    <div className="flex flex-col gap-14">
      <PageIntro
        mode="operations"
        eyebrow="Property"
        title={property.name}
        context={
          [property.location, property.address].filter(Boolean).join(" · ") ||
          undefined
        }
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={`/properties/${property.slug}/edit`}>Edit details</Link>
          </Button>
        }
      />

      {/* Operations hero — large photo carries the spatial weight. */}
      {heroPhoto ? (
        <figure className="relative aspect-[21/9] overflow-hidden rounded-md bg-surface-sunken ring-1 ring-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroPhoto.signedUrl}
            alt={heroPhoto.caption ?? property.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
          {property.status !== "active" && (
            <Badge variant="status" className="absolute right-4 top-4">
              {property.status}
            </Badge>
          )}
        </figure>
      ) : (
        <div className="relative flex aspect-[21/9] items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-surface/60 text-foreground-subtle">
          <span className="eyebrow">No photo yet — drop one in below</span>
        </div>
      )}

      {/* Fact rail — quick scannable operations data. */}
      <StatRow>
        {property.location && (
          <StatLine label="Location" value={property.location} />
        )}
        <StatLine
          label="Status"
          value={
            property.status === "active" ? "Active" : property.status
          }
        />
        {amenities.length > 0 && (
          <StatLine
            label="Amenities"
            value={amenities.length.toString()}
            unit={amenities.length === 1 ? "feature noted" : "features noted"}
          />
        )}
        {contacts && contacts.length > 0 && (
          <StatLine
            label="Contacts"
            value={contacts.length.toString()}
            unit="on file"
          />
        )}
      </StatRow>

      {/* Editorial chapters — about / how it works / house rules. */}
      <div className="grid gap-12 lg:grid-cols-[2fr_1fr] lg:gap-16">
        <div className="flex flex-col gap-12">
          <section className="flex flex-col gap-4">
            <Eyebrow>About</Eyebrow>
            <h2 className="font-display text-2xl leading-tight text-foreground">
              The place
            </h2>
            <Markdown source={property.description} tone="salon" />
          </section>

          <SectionRule />

          <section className="flex flex-col gap-4">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="font-display text-2xl leading-tight text-foreground">
              Living here
            </h2>
            <Markdown source={property.how_to} tone="ledger" />
          </section>

          <SectionRule />

          <section className="flex flex-col gap-4">
            <Eyebrow>House rules</Eyebrow>
            <h2 className="font-display text-2xl leading-tight text-foreground">
              What we ask
            </h2>
            <Markdown source={property.guidelines} tone="briefing" />
          </section>
        </div>

        {/* Side rail — amenities + contacts. */}
        <aside className="flex flex-col gap-10 lg:sticky lg:top-24 lg:self-start">
          {amenities.length > 0 && (
            <LedgerPanel className="px-5 py-6 sm:px-6 sm:py-7">
              <Eyebrow className="mb-3">Amenities</Eyebrow>
              <ul className="flex flex-wrap gap-2">
                {amenities.map((a) => (
                  <li key={a}>
                    <Badge variant="outline">{a}</Badge>
                  </li>
                ))}
              </ul>
            </LedgerPanel>
          )}

          <LedgerPanel className="px-0 py-0 sm:px-0 sm:py-0">
            <div className="border-b border-border px-5 py-4 sm:px-6">
              <Eyebrow>Contacts</Eyebrow>
              <h3 className="font-display text-lg leading-tight text-foreground">
                On the ground
              </h3>
            </div>
            {!contacts || contacts.length === 0 ? (
              <p className="px-5 py-6 text-sm italic text-foreground-subtle sm:px-6">
                No contacts on file. Add caretakers, plumbers, emergency
                numbers from the{" "}
                <Link
                  href={`/properties/${property.slug}/edit`}
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  edit page
                </Link>
                .
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {contacts.map((c) => (
                  <li key={c.id} className="flex flex-col gap-1.5 px-5 py-4 sm:px-6">
                    <div className="flex items-baseline justify-between gap-3">
                      <Eyebrow className="text-foreground-subtle">
                        {c.label}
                      </Eyebrow>
                      {c.name && (
                        <span className="text-sm text-foreground">
                          {c.name}
                        </span>
                      )}
                    </div>
                    {(c.phone || c.email) && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        {c.phone && (
                          <a
                            href={`tel:${c.phone}`}
                            className="text-foreground underline-offset-4 hover:underline"
                          >
                            {c.phone}
                          </a>
                        )}
                        {c.email && (
                          <a
                            href={`mailto:${c.email}`}
                            className="text-foreground-muted underline-offset-4 hover:text-foreground hover:underline"
                          >
                            {c.email}
                          </a>
                        )}
                      </div>
                    )}
                    {c.notes && (
                      <p className="text-xs text-foreground-subtle">
                        {c.notes}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </LedgerPanel>
        </aside>
      </div>

      <SectionRule label="The archive" />

      <section className="flex flex-col gap-6">
        <header className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-2xl leading-tight text-foreground sm:text-[1.75rem]">
            Photos
          </h2>
          <p className="text-xs text-foreground-subtle">
            Anyone in the family can add to this gallery.
          </p>
        </header>

        <PhotoUpload
          attachment={{ kind: "property", propertyId: property.id }}
        />

        <PropertyGallery photos={restPhotos} />
      </section>
    </div>
  );
}
