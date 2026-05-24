import Link from "next/link";
import { loadPropertyCards } from "@/lib/properties";

export const dynamic = "force-dynamic";

export default async function PropertiesPage() {
  const properties = await loadPropertyCards();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Properties
        </h1>
        <p className="text-muted-foreground mt-1">
          Family-shared places. Any member can edit the details.
        </p>
      </div>

      {properties.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          No properties yet.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((p) => (
            <li key={p.id}>
              <Link
                href={`/properties/${p.slug}`}
                className="group block overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-foreground/30"
              >
                <div className="aspect-[16/10] relative bg-gradient-to-br from-muted to-muted/50">
                  {p.heroImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.heroImageUrl}
                      alt={p.name}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40 text-sm">
                      No photo yet
                    </div>
                  )}
                  {p.status !== "active" && (
                    <span className="absolute right-2 top-2 rounded-full bg-foreground/85 px-2 py-0.5 text-[10px] uppercase tracking-wide text-background">
                      {p.status}
                    </span>
                  )}
                </div>
                <div className="px-4 py-3">
                  <div className="font-medium">{p.name}</div>
                  {p.location && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {p.location}
                    </div>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
