import Link from "next/link";
import { redirect } from "next/navigation";

import {
  BriefingPanel,
  PanelDescription,
  PanelEyebrow,
  PanelHeader,
  PanelTitle,
  PageIntro,
} from "@/components/shell";
import { createClient } from "@/lib/supabase/server";
import { resolveTrustViewer } from "@/lib/trust/auth";
import { isTaxonomyConfigured } from "@/lib/trust/taxonomy";
import { OrganizeFlow } from "./organize-flow";

// Advisory mode (page-mode-orchestrator): a manager-only working screen in
// the briefing register. One job: run the proposal, review it, apply it.

export const dynamic = "force-dynamic";

export default async function OrganizePage() {
  const viewer = await resolveTrustViewer();
  if (!viewer || !viewer.isTrustManager) {
    // Not a manager's screen; the documents page explains the access model.
    redirect("/advisory/documents");
  }

  const supabase = await createClient();
  const [{ data: docs }, { data: cats }] = await Promise.all([
    supabase
      .from("trust_documents")
      .select("id, name, category_id")
      .eq("kind", "document")
      .order("created_at", { ascending: false })
      .returns<{ id: string; name: string; category_id: string | null }[]>(),
    supabase
      .from("trust_categories")
      .select("id, name")
      .returns<{ id: string; name: string }[]>(),
  ]);

  const register = docs ?? [];
  const hasExisting = (cats ?? []).length > 0;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10">
      <PageIntro
        mode="advisory"
        eyebrow="Advisory"
        title="Organize the Documents"
        context={
          hasExisting
            ? "Propose an updated organization for the register. The current categories are kept unless you change them; nothing is applied until you approve it."
            : "Read the register and propose a first organization. Nothing is applied until you review and approve it."
        }
      />

      {register.length === 0 ? (
        <BriefingPanel>
          <PanelHeader>
            <PanelEyebrow>Not yet</PanelEyebrow>
            <PanelTitle>Nothing to Organize</PanelTitle>
            <PanelDescription>
              The register is empty. Add documents first, then come back; the
              organization is proposed from what the documents actually are.
            </PanelDescription>
          </PanelHeader>
          <Link
            href="/advisory/documents"
            className="text-sm text-accent-advisory underline-offset-4 hover:underline"
          >
            Back to Trust Documents
          </Link>
        </BriefingPanel>
      ) : (
        <OrganizeFlow
          documents={register.map((d) => ({ id: d.id, name: d.name }))}
          hasExisting={hasExisting}
          configured={isTaxonomyConfigured()}
        />
      )}
    </div>
  );
}
