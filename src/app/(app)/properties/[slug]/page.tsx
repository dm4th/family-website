import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { withSignedUrls } from "@/lib/photos";
import { canManageProperty } from "@/lib/property-auth";
import { resolveViewer } from "@/lib/guest";
import { Markdown } from "@/components/markdown";
import { AddPhotosModal } from "@/components/add-photos-modal";
import { RemovePhotoButton } from "@/components/remove-photo-button";
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
import { buildWifiPayload, wifiQrSvg } from "@/lib/wifi-qr";
import type { PropertyContactKind } from "@/lib/db/schema";
import { PropertyGallery } from "./property-gallery";
import { SetHeroButton } from "./set-hero-button";
import { WifiPanel } from "./wifi-panel";
import { GuestAccessPanel, type GuestGrantRow } from "./guests/guest-access-panel";

export const dynamic = "force-dynamic";

type ContactRow = {
  id: string;
  label: string;
  kind: PropertyContactKind | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

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
      "id, slug, name, location, address, description, how_to, guidelines, amenities, wifi_network, wifi_password, status, hero_image_path, updated_at, updated_by",
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

  // Thumb rendition: the gallery strip uses the small `signedUrl`; the hero
  // (below) reads `fallbackUrl` (the full object) for the large 21:9 frame.
  const signedPhotos = await withSignedUrls(
    (photoRows ?? []).map((p) => ({
      id: p.id,
      storagePath: p.storage_path,
      caption: p.caption,
      uploadedBy: p.uploaded_by,
    })),
    "thumb",
  );

  // Contacts in display order, split by the panel each one belongs to (PRD 36).
  const { data: contacts } = await supabase
    .from("property_contacts")
    .select("id, label, kind, name, phone, email, notes, sort_order")
    .eq("property_id", property.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const allContacts = (contacts ?? []) as ContactRow[];
  const emergencyContacts = allContacts.filter((c) => c.kind === "emergency");
  const serviceContacts = allContacts.filter((c) => c.kind === "service");
  // Anything that isn't explicitly emergency or service belongs on the ground —
  // which is also where every pre-PRD-36 row lands.
  const groundContacts = allContacts.filter(
    (c) => c.kind !== "emergency" && c.kind !== "service",
  );

  // The Wi-Fi QR is built server-side and inlined; no client library, no
  // external fetch. See src/lib/wifi-qr.ts.
  const wifiNetwork = property.wifi_network as string | null;
  const wifiPassword = property.wifi_password as string | null;
  const wifiQrSvgMarkup = wifiNetwork
    ? await wifiQrSvg(
        buildWifiPayload({ network: wifiNetwork, password: wifiPassword }),
      )
    : null;

  // Hero resolution (PRD 35), matching the listing cards: an explicit
  // hero_image_path wins, otherwise the newest photo. A stored path that no
  // longer matches a photo (deleted, or path drift) falls back silently —
  // a dangling pointer must never render as a broken image.
  const explicitHero = property.hero_image_path
    ? signedPhotos.find((p) => p.storagePath === property.hero_image_path)
    : undefined;
  const heroPhoto = explicitHero ?? signedPhotos[0];
  const restPhotos = signedPhotos.filter((p) => p.id !== heroPhoto?.id);
  const amenities = (property.amenities ?? []) as string[];

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const currentUserId = user?.id ?? null;
  const viewer = await resolveViewer();
  const isGuest = viewer?.isGuest ?? false;
  // For a guest who reached a non-granted property, RLS already returned no row
  // above (→ notFound). A guest who got here is therefore granted; we still
  // gate member-only affordances below on isGuest.
  const { ok: canManage } = await canManageProperty(property.id);

  // Guest grants for this property — members/admins only (RLS hides this list
  // from guests anyway, and we don't render the panel for them).
  let guestGrants: GuestGrantRow[] = [];
  if (!isGuest) {
    const { data: grantRows } = await supabase
      .from("property_guests")
      .select("profile_id, profiles:profile_id ( full_name, email )")
      .eq("property_id", property.id);
    guestGrants = (grantRows ?? []).map((r) => {
      const p = r.profiles as unknown as
        | { full_name: string | null; email: string }
        | null;
      return {
        profileId: r.profile_id as string,
        fullName: p?.full_name ?? null,
        email: p?.email ?? "—",
      };
    });
  }

  const heroCanRemove =
    !!heroPhoto &&
    (canManage ||
      (!!currentUserId && heroPhoto.uploadedBy === currentUserId));

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
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/properties/${property.slug}/calendar`}>Calendar</Link>
            </Button>
            {!isGuest && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/properties/${property.slug}/edit`}>Edit Details</Link>
              </Button>
            )}
          </div>
        }
      />

      {/* Operations hero — large photo carries the spatial weight. */}
      {heroPhoto ? (
        <div className="flex flex-col gap-2">
          <figure className="group relative aspect-[21/9] overflow-hidden rounded-md bg-surface-sunken ring-1 ring-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroPhoto.fallbackUrl ?? heroPhoto.signedUrl}
              alt={heroPhoto.caption ?? property.name}
              className="absolute inset-0 h-full w-full object-cover"
              decoding="async"
            />
            {property.status !== "active" && (
              <Badge variant="status" className="absolute right-4 top-4">
                {property.status}
              </Badge>
            )}
            <RemovePhotoButton
              photoId={heroPhoto.id}
              canRemove={heroCanRemove}
              variant="overlay"
              confirmTitle="Remove the hero photo?"
              confirmBody="This will permanently delete the photo from the property. The newest remaining photo will take its place."
            />
            {/* Un-set the explicit choice (PRD 30: every choice is reversible). */}
            {canManage && !!explicitHero && (
              <SetHeroButton
                propertyId={property.id}
                storagePath={null}
                label="Use Newest Photo"
                variant="overlay"
              />
            )}
          </figure>
          {canManage && (
            <p className="text-xs text-foreground-subtle">
              {explicitHero
                ? "Hero: chosen by an admin. New uploads won't replace it."
                : "Showing the newest photo. Pick one below to keep it here."}
            </p>
          )}
        </div>
      ) : (
        <div className="relative flex aspect-[21/9] items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-surface/60 text-foreground-subtle">
          <span className="eyebrow">No photo yet. Drop one in below</span>
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
              The Place
            </h2>
            <Markdown source={property.description} tone="salon" />
          </section>

          <SectionRule />

          <section className="flex flex-col gap-4">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="font-display text-2xl leading-tight text-foreground">
              Living Here
            </h2>
            <Markdown source={property.how_to} tone="ledger" />
          </section>

          <SectionRule />

          <section className="flex flex-col gap-4">
            <Eyebrow>House rules</Eyebrow>
            <h2 className="font-display text-2xl leading-tight text-foreground">
              What We Ask
            </h2>
            <Markdown source={property.guidelines} tone="briefing" />
          </section>
        </div>

        {/* Side rail — the things people reach for, in the order they reach
            for them: emergencies, Wi-Fi, who's on the ground, then amenities
            (PRD 36). */}
        <aside className="flex flex-col gap-10 lg:sticky lg:top-24 lg:self-start">
          {/* Always renders, always first. Even with no contacts on file it
              carries 911, so it's never uselessly empty. */}
          <LedgerPanel className="px-0 py-0 sm:px-0 sm:py-0">
            <div className="border-b border-border px-5 py-4 sm:px-6">
              <Eyebrow>In an emergency</Eyebrow>
              <h3 className="font-display text-lg leading-tight text-foreground">
                Emergencies
              </h3>
            </div>
            <ul className="divide-y divide-border">
              <li className="flex flex-col gap-1.5 px-5 py-4 sm:px-6">
                <Eyebrow className="text-foreground-subtle">
                  Fire, police, ambulance
                </Eyebrow>
                <a
                  href="tel:911"
                  className="text-lg text-foreground underline-offset-4 hover:underline"
                >
                  911
                </a>
              </li>
              {emergencyContacts.map((c) => (
                <ContactLine key={c.id} contact={c} />
              ))}
            </ul>
          </LedgerPanel>

          {wifiNetwork && (
            <WifiPanel
              network={wifiNetwork}
              password={wifiPassword}
              qrSvg={wifiQrSvgMarkup}
            />
          )}

          <LedgerPanel className="px-0 py-0 sm:px-0 sm:py-0">
            <div className="border-b border-border px-5 py-4 sm:px-6">
              <Eyebrow>Contacts</Eyebrow>
              <h3 className="font-display text-lg leading-tight text-foreground">
                On the Ground
              </h3>
            </div>
            {groundContacts.length === 0 ? (
              <p className="px-5 py-6 text-sm italic text-foreground-subtle sm:px-6">
                No contacts on file.
                {!isGuest && (
                  <>
                    {" "}
                    Add caretakers, plumbers, emergency numbers from the{" "}
                    <Link
                      href={`/properties/${property.slug}/edit`}
                      className="text-foreground underline-offset-4 hover:underline"
                    >
                      edit page
                    </Link>
                    .
                  </>
                )}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {groundContacts.map((c) => (
                  <ContactLine key={c.id} contact={c} />
                ))}
              </ul>
            )}
          </LedgerPanel>

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
        </aside>
      </div>

      {/* Service directory — seventeen vendors don't belong in a sticky
          sidebar. Table-style and full width, visible to guests: someone with
          a burst pipe should be able to find the plumber. */}
      {serviceContacts.length > 0 && (
        <>
          <SectionRule label="Who fixes what" />
          <section className="flex flex-col gap-6">
            <header className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-2xl leading-tight text-foreground sm:text-[1.75rem]">
                Service Directory
              </h2>
              <p className="text-xs text-foreground-subtle">
                Vendors and trades who look after this place.
              </p>
            </header>
            <LedgerPanel className="px-0 py-0 sm:px-0 sm:py-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th scope="col" className="px-5 py-3 sm:px-6">
                        <Eyebrow className="text-foreground-subtle">
                          Service
                        </Eyebrow>
                      </th>
                      <th scope="col" className="px-5 py-3 sm:px-6">
                        <Eyebrow className="text-foreground-subtle">Who</Eyebrow>
                      </th>
                      <th scope="col" className="px-5 py-3 sm:px-6">
                        <Eyebrow className="text-foreground-subtle">
                          Reach them
                        </Eyebrow>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {serviceContacts.map((c) => (
                      <tr key={c.id} className="align-top">
                        <th
                          scope="row"
                          className="px-5 py-3 text-left font-normal text-foreground sm:px-6"
                        >
                          {c.label}
                          {c.notes && (
                            <span className="mt-1 block text-xs text-foreground-subtle">
                              {c.notes}
                            </span>
                          )}
                        </th>
                        <td className="px-5 py-3 text-foreground-muted sm:px-6">
                          {c.name ?? "—"}
                        </td>
                        <td className="px-5 py-3 sm:px-6">
                          <div className="flex flex-col gap-1">
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
                            {!c.phone && !c.email && (
                              <span className="text-foreground-subtle">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </LedgerPanel>
          </section>
        </>
      )}

      <SectionRule label="The archive" />

      <section className="flex flex-col gap-6">
        <header className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-2xl leading-tight text-foreground sm:text-[1.75rem]">
            Photos
          </h2>
          <p className="text-xs text-foreground-subtle">
            {isGuest
              ? "Photos shared by the family."
              : "Anyone in the family can add to this gallery."}
          </p>
        </header>

        {!isGuest && (
          <AddPhotosModal
            attachment={{ kind: "property", propertyId: property.id }}
          />
        )}

        <PropertyGallery
          photos={restPhotos}
          currentUserId={currentUserId}
          canManage={canManage}
          propertyId={property.id}
        />
      </section>

      {/* Guest access — members/admins only. Lets a host link a guest to this
          property without exposing the rest of the site. (PRD 15) */}
      {!isGuest && (
        <>
          <SectionRule label="Guest access" />
          <section className="grid gap-8 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
            <div className="flex flex-col gap-2">
              <Eyebrow>Hosting someone?</Eyebrow>
              <h2 className="font-display text-2xl leading-tight text-foreground">
                Add a guest
              </h2>
              <p className="text-sm text-foreground-muted">
                Give a friend or renter sign-in access to just this property.
              </p>
            </div>
            <LedgerPanel className="px-5 py-6 sm:px-6 sm:py-7">
              <GuestAccessPanel
                propertyId={property.id}
                propertySlug={property.slug}
                propertyName={property.name}
                guests={guestGrants}
              />
            </LedgerPanel>
          </section>
        </>
      )}
    </div>
  );
}

/**
 * One contact in an aside panel — used by both Emergencies and On the Ground
 * so the two never drift apart. The service directory renders as a table
 * instead, because seventeen rows want columns.
 */
function ContactLine({ contact }: { contact: ContactRow }) {
  return (
    <li className="flex flex-col gap-1.5 px-5 py-4 sm:px-6">
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow className="text-foreground-subtle">{contact.label}</Eyebrow>
        {contact.name && (
          <span className="text-sm text-foreground">{contact.name}</span>
        )}
      </div>
      {(contact.phone || contact.email) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {contact.phone && (
            <a
              href={`tel:${contact.phone}`}
              className="text-foreground underline-offset-4 hover:underline"
            >
              {contact.phone}
            </a>
          )}
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="text-foreground-muted underline-offset-4 hover:text-foreground hover:underline"
            >
              {contact.email}
            </a>
          )}
        </div>
      )}
      {contact.notes && (
        <p className="text-xs text-foreground-subtle">{contact.notes}</p>
      )}
    </li>
  );
}
