import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";

import {
  BriefingPanel,
  PanelBody,
  PanelDescription,
  PanelEyebrow,
  PanelHeader,
  PanelTitle,
  PageIntro,
} from "@/components/shell";
import { createClient } from "@/lib/supabase/server";
import { resolveTrustViewer } from "@/lib/trust/auth";
import { isNotebookConfigured } from "@/lib/trust/notebook";
import { ReadScanButton } from "./read-scan-button";

// Advisory mode (page-mode-orchestrator): the manager's notebook work queue.
// One dominant module — the list of pages and where each stands.

export const dynamic = "force-dynamic";

type ScanRow = { id: string; name: string; created_at: string };
type AnnotationCount = { scan_document_id: string; status: string };

export default async function NotebookPage() {
  const viewer = await resolveTrustViewer();
  if (!viewer || !viewer.isTrustManager) {
    redirect("/advisory/documents");
  }

  const supabase = await createClient();
  const [{ data: scans }, { data: annotationRows }, { data: pageRows }] =
    await Promise.all([
      supabase
        .from("trust_documents")
        .select("id, name, created_at")
        .eq("kind", "scan")
        .order("created_at", { ascending: true })
        .returns<ScanRow[]>(),
      supabase
        .from("trust_annotations")
        .select("scan_document_id, status")
        .returns<AnnotationCount[]>(),
      supabase
        .from("trust_document_pages")
        .select("document_id")
        .returns<{ document_id: string }[]>(),
    ]);

  const readScans = new Set((pageRows ?? []).map((p) => p.document_id));
  const counts = new Map<string, { pending: number; approved: number; denied: number }>();
  for (const a of annotationRows ?? []) {
    const c = counts.get(a.scan_document_id) ?? { pending: 0, approved: 0, denied: 0 };
    if (a.status === "pending") c.pending += 1;
    else if (a.status === "approved") c.approved += 1;
    else c.denied += 1;
    counts.set(a.scan_document_id, c);
  }

  const rows = scans ?? [];
  const totalPending = [...counts.values()].reduce((n, c) => n + c.pending, 0);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10">
      <PageIntro
        mode="advisory"
        eyebrow="Advisory"
        title="The Notebook"
        context={
          rows.length === 0
            ? "Photographed pages of the handwritten notebook, read and reviewed one by one."
            : totalPending > 0
              ? `${totalPending} point${totalPending === 1 ? "" : "s"} waiting for a decision. Nothing is treated as true until you approve it.`
              : "Every read point has a decision. Reading a page again never reopens what you've already judged."
        }
      />

      <BriefingPanel>
        <PanelHeader>
          <PanelEyebrow>Work queue</PanelEyebrow>
          <PanelTitle>Pages</PanelTitle>
          <PanelDescription>
            Read a page to transcribe the handwriting and pull out its key
            points, then review each point: approve it (edited if needed),
            link it to the document it refers to, or set it aside.
          </PanelDescription>
        </PanelHeader>
        <PanelBody>
          {rows.length === 0 ? (
            <p className="text-sm text-foreground-subtle">
              No pages yet. Add photos of the notebook in the{" "}
              <Link
                href="/advisory/documents"
                className="text-accent-advisory underline-offset-4 hover:underline"
              >
                Notebook Pages box on the documents page
              </Link>
              .
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border border-y border-border">
              {rows.map((scan) => {
                const c = counts.get(scan.id) ?? { pending: 0, approved: 0, denied: 0 };
                const wasRead = readScans.has(scan.id) || c.pending + c.approved + c.denied > 0;
                const statusLine = !wasRead
                  ? "Not yet read"
                  : c.pending > 0
                    ? `${c.pending} waiting · ${c.approved} approved`
                    : `${c.approved} approved · ${c.denied} set aside`;
                return (
                  <li
                    key={scan.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-4"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-base text-foreground">{scan.name}</span>
                      <span className="text-xs text-foreground-subtle">
                        Added {format(new Date(scan.created_at), "MMMM d, yyyy")}
                        {" · "}
                        {statusLine}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {isNotebookConfigured() && (
                        <ReadScanButton documentId={scan.id} again={wasRead} />
                      )}
                      {wasRead && (
                        <Link
                          href={`/advisory/notebook/review/${scan.id}`}
                          className="inline-flex h-10 items-center rounded-md border border-input px-3 text-sm text-foreground transition-colors hover:bg-surface-sunken"
                        >
                          Review
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {!isNotebookConfigured() && rows.length > 0 && (
            <p className="text-sm text-foreground-muted">
              Reading the notebook isn&rsquo;t set up yet. An admin needs to
              add the ANTHROPIC_API_KEY setting.
            </p>
          )}
        </PanelBody>
      </BriefingPanel>
    </div>
  );
}
