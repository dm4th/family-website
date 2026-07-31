import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { canManageProperty } from "@/lib/property-auth";
import { resolveViewer } from "@/lib/guest";
import { isIntakeConfigured } from "@/lib/intake/extract";
import { loadIntakeDocuments } from "@/lib/intake/documents";
import { LedgerPanel, PageIntro } from "@/components/shell";
import { IntakeFlow } from "./intake-flow";
import { DocumentsPanel } from "./documents-panel";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export default async function PropertyIntakePage({
  params,
}: {
  params: Params;
}) {
  const { slug } = await params;

  // Same gate as the edit page: a granted guest can read this property, so RLS
  // alone wouldn't 404 them. The `extractIntake` action rejects guests too.
  const viewer = await resolveViewer();
  if (viewer?.isGuest) notFound();

  const supabase = await createClient();
  const { data: property, error } = await supabase
    .from("properties")
    .select(
      "id, slug, name, location, address, description, how_to, guidelines, amenities, status, max_guests",
    )
    .eq("slug", slug)
    .single();
  if (error || !property) notFound();

  const { ok: canManage } = await canManageProperty(property.id);

  // Listed whether or not reading is currently configured: documents already
  // stored still need an owner control, and pulling the API key shouldn't lock
  // anyone out of tidying them.
  const documents = await loadIntakeDocuments(property.id);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-1">
        <Link
          href={`/properties/${property.slug}/edit`}
          className="text-sm text-foreground-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Back to editing {property.name}
        </Link>
      </div>

      <PageIntro
        mode="operations"
        eyebrow="Add from a photo"
        title={property.name}
        context="Photograph a bill or a handwritten note and we'll fill in the details for you to check."
      />

      <LedgerPanel className="max-w-3xl">
        {isIntakeConfigured() ? (
          <IntakeFlow
            property={{
              id: property.id,
              slug: property.slug,
              name: property.name,
              location: property.location,
              address: property.address,
              description: property.description,
              how_to: property.how_to,
              guidelines: property.guidelines,
              amenities: property.amenities ?? [],
              status: property.status,
              max_guests: property.max_guests ?? null,
            }}
            canManage={canManage}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-xl leading-tight text-foreground">
              Not set up yet
            </h2>
            <p className="text-base text-foreground-muted">
              Reading documents needs a setting an admin has to add before this
              page can do anything. In the meantime you can add contacts by hand
              on the edit page.
            </p>
            <div>
              <Link
                href={`/properties/${property.slug}/edit`}
                className="text-base text-foreground underline underline-offset-4"
              >
                Back to editing {property.name}
              </Link>
            </div>
          </div>
        )}
      </LedgerPanel>

      <LedgerPanel className="max-w-3xl px-0 py-0 sm:px-0 sm:py-0">
        <DocumentsPanel documents={documents} />
      </LedgerPanel>
    </div>
  );
}
