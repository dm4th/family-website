import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";

import {
  BriefingPanel,
  PanelBody,
  PanelDescription,
  PanelEyebrow,
  PanelHeader,
  PanelTitle,
  PageIntro,
  SectionRule,
} from "@/components/shell";
import { createClient } from "@/lib/supabase/server";
import { resolveTrustViewer } from "@/lib/trust/auth";
import { OpenDocumentButton } from "../../../documents/document-controls";
import {
  AnnotationReviewCard,
  type MappableDocument,
  type ReviewAnnotation,
} from "./annotation-review";

// Advisory mode: the per-page review desk. The transcription and the original
// sit beside the points; every verdict is per point, and edits happen before
// approval, never after.

export const dynamic = "force-dynamic";

type AnnotationRow = {
  id: string;
  text: string;
  source_quote: string | null;
  confidence: "high" | "medium" | "low" | null;
  mapped_document_id: string | null;
  mapped_page: number | null;
  mapping_note: string | null;
  status: "pending" | "approved" | "denied";
  reviewed_by: string | null;
  reviewed_at: string | null;
};

export default async function ScanReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await resolveTrustViewer();
  if (!viewer || !viewer.isTrustManager) {
    redirect("/advisory/documents");
  }
  const { id } = await params;

  const supabase = await createClient();
  const { data: scan } = await supabase
    .from("trust_documents")
    .select("id, name, kind, created_at")
    .eq("id", id)
    .maybeSingle<{ id: string; name: string; kind: string; created_at: string }>();
  if (!scan || scan.kind !== "scan") notFound();

  const [{ data: pages }, { data: annotations }, { data: documents }, { data: profiles }] =
    await Promise.all([
      supabase
        .from("trust_document_pages")
        .select("page_number, text")
        .eq("document_id", scan.id)
        .order("page_number")
        .returns<{ page_number: number; text: string }[]>(),
      supabase
        .from("trust_annotations")
        .select(
          "id, text, source_quote, confidence, mapped_document_id, mapped_page, mapping_note, status, reviewed_by, reviewed_at",
        )
        .eq("scan_document_id", scan.id)
        .order("created_at")
        .returns<AnnotationRow[]>(),
      supabase
        .from("trust_documents")
        .select("id, name")
        .eq("kind", "document")
        .order("name")
        .returns<MappableDocument[]>(),
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .returns<{ id: string; full_name: string | null; email: string }[]>(),
    ]);

  const nameOf = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name || p.email]),
  );
  const docName = new Map((documents ?? []).map((d) => [d.id, d.name]));
  const all = annotations ?? [];
  const pendingRows = all.filter((a) => a.status === "pending");
  const judgedRows = all.filter((a) => a.status !== "pending");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10">
      <PageIntro
        mode="advisory"
        eyebrow="Notebook review"
        title={scan.name}
        context={`Added ${format(new Date(scan.created_at), "MMMM d, yyyy")}. Approve each point (edit it first if the reading is off), link it to the document it refers to, or set it aside.`}
        action={<OpenDocumentButton documentId={scan.id} />}
      />

      <BriefingPanel>
        <PanelHeader>
          <PanelEyebrow>What the page says</PanelEyebrow>
          <PanelTitle>Transcription</PanelTitle>
          <PanelDescription>
            Read verbatim from the handwriting. Words the reader couldn&rsquo;t
            make out are marked [unclear] rather than guessed; hold it against
            the original with the Open button above.
          </PanelDescription>
        </PanelHeader>
        <PanelBody>
          {(pages ?? []).length === 0 ? (
            <p className="text-sm text-foreground-subtle">
              This page hasn&rsquo;t been read yet.
            </p>
          ) : (
            (pages ?? []).map((p) => (
              <div key={p.page_number} className="flex flex-col gap-1.5">
                {(pages ?? []).length > 1 && (
                  <span className="eyebrow text-foreground-subtle">
                    Page {p.page_number}
                  </span>
                )}
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {p.text || "(no readable text)"}
                </p>
              </div>
            ))
          )}
        </PanelBody>
      </BriefingPanel>

      <BriefingPanel>
        <PanelHeader>
          <PanelEyebrow>Your decisions</PanelEyebrow>
          <PanelTitle>Points Waiting for Review</PanelTitle>
          {pendingRows.length > 0 && (
            <PanelDescription>
              Each quoted line shows the words a point rests on. Nothing is
              treated as true until you approve it here.
            </PanelDescription>
          )}
        </PanelHeader>
        <PanelBody>
          {pendingRows.length === 0 ? (
            <p className="text-sm text-foreground-subtle">
              Nothing waiting. Reading the page again proposes only points you
              haven&rsquo;t already judged.
            </p>
          ) : (
            pendingRows.map((a) => (
              <AnnotationReviewCard
                key={a.id}
                annotation={{
                  id: a.id,
                  text: a.text,
                  sourceQuote: a.source_quote,
                  confidence: a.confidence,
                  mappedDocumentId: a.mapped_document_id,
                  mappedPage: a.mapped_page,
                  mappingNote: a.mapping_note,
                } satisfies ReviewAnnotation}
                documents={documents ?? []}
              />
            ))
          )}
        </PanelBody>
      </BriefingPanel>

      {judgedRows.length > 0 && (
        <>
          <SectionRule label="Decided" />
          <BriefingPanel>
            <PanelHeader>
              <PanelEyebrow>The record</PanelEyebrow>
              <PanelTitle>Approved and Set Aside</PanelTitle>
            </PanelHeader>
            <PanelBody>
              <ul className="flex flex-col divide-y divide-border border-y border-border">
                {judgedRows.map((a) => (
                  <li key={a.id} className="flex flex-col gap-1 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span
                        className={
                          a.status === "approved"
                            ? "text-sm text-foreground"
                            : "text-sm text-foreground-subtle line-through"
                        }
                      >
                        {a.text}
                      </span>
                      <span className="shrink-0 text-xs text-foreground-subtle">
                        {a.status === "approved" ? "Approved" : "Set aside"}
                        {a.reviewed_by
                          ? ` by ${nameOf.get(a.reviewed_by) ?? "a manager"}`
                          : ""}
                      </span>
                    </div>
                    {a.status === "approved" && a.mapped_document_id && (
                      <span className="text-xs text-foreground-subtle">
                        Refers to {docName.get(a.mapped_document_id) ?? "a document"}
                        {a.mapped_page ? `, page ${a.mapped_page}` : ""}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </PanelBody>
          </BriefingPanel>
        </>
      )}

      <Link
        href="/advisory/notebook"
        className="text-sm text-accent-advisory underline-offset-4 hover:underline"
      >
        Back to the Notebook
      </Link>
    </div>
  );
}
