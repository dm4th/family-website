import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveViewer } from "@/lib/guest";
import { normalizeName } from "@/lib/legacy-import";
import { PageIntro } from "@/components/shell";
import { PeopleImport } from "./people-import";

export const dynamic = "force-dynamic";

export default async function PeopleImportPage() {
  // Bulk import is family-only, like the rest of Legacy. RLS already blocks a
  // guest's writes, but we 404 the route so a guest never sees the form.
  const viewer = await resolveViewer();
  if (viewer?.isGuest) notFound();

  const supabase = await createClient();
  const { data: existing } = await supabase.from("people").select("display_name");
  const existingNamesLower = [
    ...new Set((existing ?? []).map((p) => normalizeName(p.display_name as string))),
  ];

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <Link
          href="/family/tree"
          className="text-sm text-foreground-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          ← The Family Tree
        </Link>
        <PageIntro
          mode="family"
          eyebrow="Family · Legacy"
          title="Import People"
          context="Add many relatives at once from a spreadsheet, instead of one form at a time. Review a preview before anything is written, and re-run safely: matching names are skipped, never doubled."
        />
      </div>

      <PeopleImport existingNamesLower={existingNamesLower} />
    </div>
  );
}
