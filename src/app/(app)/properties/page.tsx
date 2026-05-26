import Link from "next/link";

import { loadPropertyCards } from "@/lib/properties";
import { Badge } from "@/components/ui/badge";
import { Eyebrow, PageIntro } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function PropertiesPage() {
  const properties = await loadPropertyCards();

  // First active property anchors the page; the rest form a supporting strip.
  const [anchor, ...rest] = properties;

  return (
    <div className="flex flex-col gap-14">
      <PageIntro
        mode="operations"
        eyebrow="Operations"
        title="Properties"
        context="Family-shared places. Any member can update the details; every change is recorded."
      />

      {properties.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-12">
          {anchor && <AnchorCard property={anchor} />}
          {rest.length > 0 && (
            <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((p) => (
                <li key={p.id}>
                  <PropertyCard property={p} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

type PropertyCardData = Awaited<ReturnType<typeof loadPropertyCards>>[number];

function AnchorCard({ property }: { property: PropertyCardData }) {
  return (
    <Link
      href={`/properties/${property.slug}`}
      className="group grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:gap-12"
    >
      <div className="relative aspect-[16/10] overflow-hidden rounded-md bg-surface-sunken ring-1 ring-border">
        {property.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={property.heroImageUrl}
            alt={property.name}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.015]"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-foreground-subtle">
            <span className="eyebrow">No photo yet</span>
          </div>
        )}
        {property.status !== "active" && (
          <Badge variant="status" className="absolute right-3 top-3">
            {property.status}
          </Badge>
        )}
      </div>
      <div className="flex flex-col justify-end gap-3 pb-2">
        <Eyebrow>Featured property</Eyebrow>
        <h2 className="font-display text-3xl leading-[1.05] text-foreground transition-colors group-hover:text-accent-operations sm:text-[2.25rem]">
          {property.name}
        </h2>
        {property.location && (
          <p className="text-sm text-foreground-muted">{property.location}</p>
        )}
      </div>
    </Link>
  );
}

function PropertyCard({ property }: { property: PropertyCardData }) {
  return (
    <Link href={`/properties/${property.slug}`} className="group block">
      <div className="relative aspect-[16/10] overflow-hidden rounded-md bg-surface-sunken ring-1 ring-border">
        {property.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={property.heroImageUrl}
            alt={property.name}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-foreground-subtle">
            <span className="eyebrow">No photo yet</span>
          </div>
        )}
        {property.status !== "active" && (
          <Badge variant="status" className="absolute right-3 top-3">
            {property.status}
          </Badge>
        )}
      </div>
      <div className="mt-4 flex flex-col gap-1">
        <h3 className="font-display text-xl leading-tight text-foreground transition-colors group-hover:text-accent-operations">
          {property.name}
        </h3>
        {property.location && (
          <p className="text-xs text-foreground-subtle">{property.location}</p>
        )}
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-border bg-surface/60 px-10 py-14 text-center">
      <p className="eyebrow text-accent-bronze">No registry entries</p>
      <p className="mt-3 text-sm text-foreground-muted">
        No properties have been registered yet. A site admin can create one
        from the{" "}
        <Link href="/admin" className="text-foreground underline-offset-4 hover:underline">
          admin page
        </Link>
        .
      </p>
    </div>
  );
}
