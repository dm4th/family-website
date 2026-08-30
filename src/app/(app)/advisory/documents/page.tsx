import Link from "next/link";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";

import {
  ActivityDigest,
  ActivityDigestItem,
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
import type { TrustDocumentKind, TrustEventKind } from "@/lib/db/schema";
import {
  DeleteDocumentButton,
  OpenDocumentButton,
  ShareControls,
  type TrustPerson,
} from "./document-controls";
import { ManagerRoster } from "./manager-roster";
import { TrustUpload } from "./trust-upload";

// Advisory mode (page-mode-orchestrator): the trust's own papers. Memo-like,
// disciplined, deep-teal accents, BriefingPanel throughout. The dominant
// module is the document register; upload and stewardship sit around it.

export const dynamic = "force-dynamic";

type DocumentRow = {
  id: string;
  name: string;
  kind: TrustDocumentKind;
  content_type: string;
  byte_size: number;
  uploaded_by: string | null;
  category_id: string | null;
  created_at: string;
};

type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  position: number;
};

type GrantRow = { document_id: string; profile_id: string };

type EventRow = {
  id: string;
  event: TrustEventKind;
  actor_id: string | null;
  document_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

function eventTitle(event: EventRow, docNames: Map<string, string>): string {
  const d = (key: string): string | null => {
    const v = event.detail?.[key];
    return typeof v === "string" && v ? v : null;
  };
  const docName =
    (event.document_id ? docNames.get(event.document_id) : null) ??
    d("documentName") ??
    d("name") ??
    "a document";
  switch (event.event) {
    case "uploaded":
      return `Added ${docName}`;
    case "viewed":
      return `Opened ${docName}`;
    case "grant_added":
      return `Shared ${docName} with ${d("granteeName") ?? "someone"}`;
    case "grant_revoked":
      return `Removed ${d("granteeName") ?? "someone"}'s access to ${docName}`;
    case "document_deleted":
      return `Removed ${docName}`;
    case "manager_added":
      return `Seated ${d("managerName") ?? "someone"} as a trust manager`;
    case "manager_removed":
      return `Removed ${d("managerName") ?? "someone"} as a trust manager`;
    case "taxonomy_applied": {
      const n = event.detail?.["categories"];
      return typeof n === "number"
        ? `Organized the register into ${n} ${n === 1 ? "category" : "categories"}`
        : "Organized the register";
    }
  }
}

export default async function TrustDocumentsPage() {
  const viewer = await resolveTrustViewer();
  if (!viewer) return null; // proxy.ts already redirects signed-out visitors

  const supabase = await createClient();

  // RLS shapes every one of these to the viewer: a manager sees everything, a
  // grant holder sees their documents and their own grants, everyone else
  // sees empty sets. The page renders what comes back and nothing more.
  const [
    { data: documents },
    { data: grants },
    { data: managerRows },
    { data: categoryRows },
  ] =
    await Promise.all([
      supabase
        .from("trust_documents")
        .select(
          "id, name, kind, content_type, byte_size, uploaded_by, category_id, created_at",
        )
        .order("created_at", { ascending: false })
        .returns<DocumentRow[]>(),
      supabase
        .from("trust_document_access")
        .select("document_id, profile_id")
        .returns<GrantRow[]>(),
      supabase.from("trust_managers").select("profile_id"),
      supabase
        .from("trust_categories")
        .select("id, name, description, position")
        .order("position")
        .returns<CategoryRow[]>(),
    ]);

  const docs = documents ?? [];
  const managerIds = new Set((managerRows ?? []).map((m) => m.profile_id));

  // People, for names everywhere and for the manager's share/roster pickers.
  // Members can read the family roster already; for a grant-holding guest this
  // may come back short, which only affects name lookups, never access.
  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, full_name, email, deactivated_at")
    .order("full_name");
  const people: TrustPerson[] = (profileRows ?? [])
    .filter((p) => p.deactivated_at === null)
    .map((p) => ({ id: p.id, name: p.full_name || p.email }));
  const nameOf = new Map(people.map((p) => [p.id, p.name]));

  const grantsByDoc = new Map<string, TrustPerson[]>();
  for (const g of grants ?? []) {
    const list = grantsByDoc.get(g.document_id) ?? [];
    list.push({ id: g.profile_id, name: nameOf.get(g.profile_id) ?? "A family member" });
    grantsByDoc.set(g.document_id, list);
  }

  const managers: TrustPerson[] = [...managerIds].map((id) => ({
    id,
    name: nameOf.get(id) ?? "A family member",
  }));

  // The audit digest, managers only (RLS returns nothing to anyone else, so
  // skip the query rather than render an empty panel).
  let events: EventRow[] = [];
  if (viewer.isTrustManager) {
    const { data } = await supabase
      .from("trust_document_events")
      .select("id, event, actor_id, document_id, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(15)
      .returns<EventRow[]>();
    events = data ?? [];
  }

  const originals = docs.filter((d) => d.kind === "document");
  const scans = docs.filter((d) => d.kind === "scan");
  const hasStanding = viewer.isTrustManager || docs.length > 0;

  // The register, grouped by the approved taxonomy (PRD 40 slice 2). A viewer
  // sees only categories that hold documents they can read; before any
  // taxonomy is applied there is exactly one unnamed group and the register
  // renders as the flat list it was in slice 1.
  const categories = categoryRows ?? [];
  const registerGroups = [
    ...categories.map((c) => ({
      key: c.id,
      name: c.name,
      description: c.description,
      docs: originals.filter((d) => d.category_id === c.id),
    })),
    {
      key: "uncategorized",
      name: "Not Yet Categorized",
      description: null as string | null,
      docs: originals.filter(
        (d) => !d.category_id || !categories.some((c) => c.id === d.category_id),
      ),
    },
  ].filter((g) => g.docs.length > 0);

  return (
    // The (app) layout supplies the outer container + padding; Advisory pages
    // take a narrower measure inside it for the memo feel.
    <div className="mx-auto flex max-w-5xl flex-col gap-10">
      <PageIntro
        mode="advisory"
        eyebrow="Advisory"
        title="Trust Documents"
        context={
          viewer.isTrustManager
            ? "The trust's papers, held privately. Every document is shared by name, and every open is recorded."
            : hasStanding
              ? "The documents shared with you by the trust's managers. Every open is recorded."
              : "The trust's private document vault."
        }
        action={
          viewer.isTrustManager && originals.length > 0 ? (
            <Button asChild variant="outline">
              <Link href="/advisory/documents/organize">Organize</Link>
            </Button>
          ) : undefined
        }
      />

      {!hasStanding ? (
        <BriefingPanel>
          <PanelHeader>
            <PanelEyebrow>Access</PanelEyebrow>
            <PanelTitle>Shared by name only</PanelTitle>
            <PanelDescription>
              Trust documents are not general family reading. The
              trust&rsquo;s managers share each document with the specific
              people it concerns; nothing here is visible until one is shared
              with you.
            </PanelDescription>
          </PanelHeader>
        </BriefingPanel>
      ) : (
        <>
          {viewer.isTrustManager && (
            <BriefingPanel>
              <PanelHeader>
                <PanelEyebrow>Add to the vault</PanelEyebrow>
                <PanelTitle>Bring the Papers In</PanelTitle>
                <PanelDescription>
                  Drag files in from your computer; a whole selection at once
                  is fine. Documents stay private until you share them, and
                  everything that happens here is recorded below.
                </PanelDescription>
              </PanelHeader>
              <PanelBody>
                <TrustUpload />
              </PanelBody>
            </BriefingPanel>
          )}

          <BriefingPanel>
            <PanelHeader>
              <PanelEyebrow>The register</PanelEyebrow>
              <PanelTitle>Documents</PanelTitle>
              {viewer.isTrustManager && originals.length > 0 && (
                <PanelDescription>
                  {categories.length === 0
                    ? "Once a few documents are in, Organize proposes categories for you to approve; until then the newest additions sit on top."
                    : "Grouped by the organization you approved. Run Organize again any time to fit new additions in."}
                </PanelDescription>
              )}
            </PanelHeader>
            <PanelBody>
              {originals.length === 0 ? (
                <p className="text-sm text-foreground-subtle">
                  {viewer.isTrustManager
                    ? "Nothing here yet. The vault opens with the first document you add above."
                    : "No documents have been shared with you yet."}
                </p>
              ) : (
                registerGroups.map((group) => (
                  <section key={group.key} className="flex flex-col gap-2">
                    {registerGroups.length > 1 && (
                      <div className="flex items-baseline gap-3">
                        <h3 className="eyebrow text-accent-advisory">
                          {group.name}
                        </h3>
                        {group.description && (
                          <span className="text-xs text-foreground-subtle">
                            {group.description}
                          </span>
                        )}
                      </div>
                    )}
                    <ul className="flex flex-col divide-y divide-border border-y border-border">
                      {group.docs.map((doc) => (
                        <li key={doc.id} className="flex flex-col gap-3 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <span className="truncate text-base text-foreground">
                                {doc.name}
                              </span>
                              <span className="text-xs text-foreground-subtle">
                                Added {format(new Date(doc.created_at), "MMMM d, yyyy")}
                                {doc.uploaded_by
                                  ? ` by ${nameOf.get(doc.uploaded_by) ?? "a manager"}`
                                  : ""}
                                {" · "}
                                {formatBytes(doc.byte_size)}
                              </span>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <OpenDocumentButton documentId={doc.id} />
                              {viewer.isTrustManager && (
                                <DeleteDocumentButton
                                  documentId={doc.id}
                                  documentName={doc.name}
                                />
                              )}
                            </div>
                          </div>
                          {viewer.isTrustManager && (
                            <ShareControls
                              documentId={doc.id}
                              documentName={doc.name}
                              grants={grantsByDoc.get(doc.id) ?? []}
                              people={people}
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </PanelBody>
          </BriefingPanel>

          {(viewer.isTrustManager || scans.length > 0) && (
            <BriefingPanel>
              <PanelHeader>
                <PanelEyebrow>The notebook</PanelEyebrow>
                <PanelTitle>Notebook Pages</PanelTitle>
                <PanelDescription>
                  Photographed pages from the handwritten notebook, stored
                  safely. Reading them and matching them to the documents is
                  the next piece to arrive.
                </PanelDescription>
              </PanelHeader>
              <PanelBody>
                {scans.length === 0 ? (
                  <p className="text-sm text-foreground-subtle">
                    No pages yet. Drop photos of the notebook in the second box
                    above.
                  </p>
                ) : (
                  <ul className="flex flex-col divide-y divide-border border-y border-border">
                    {scans.map((doc) => (
                      <li
                        key={doc.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-4"
                      >
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-base text-foreground">
                            {doc.name}
                          </span>
                          <span className="text-xs text-foreground-subtle">
                            Added {format(new Date(doc.created_at), "MMMM d, yyyy")}
                            {" · "}
                            {formatBytes(doc.byte_size)}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <OpenDocumentButton documentId={doc.id} />
                          {viewer.isTrustManager && (
                            <DeleteDocumentButton
                              documentId={doc.id}
                              documentName={doc.name}
                            />
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </PanelBody>
            </BriefingPanel>
          )}
        </>
      )}

      {(viewer.isTrustManager || viewer.isAdmin) && (
        <>
          <SectionRule label="Stewardship" />
          <div className="grid gap-10 lg:grid-cols-2">
            <BriefingPanel>
              <PanelHeader>
                <PanelEyebrow>The roster</PanelEyebrow>
                <PanelTitle>Trust Managers</PanelTitle>
                <PanelDescription>
                  Managers add, share, and remove documents. Site admins seat
                  the roster; being an admin grants no document access by
                  itself.
                </PanelDescription>
              </PanelHeader>
              <PanelBody>
                <ManagerRoster
                  managers={managers}
                  candidates={people.filter((p) => !managerIds.has(p.id))}
                  canEdit={viewer.isAdmin}
                />
              </PanelBody>
            </BriefingPanel>

            {viewer.isTrustManager && (
              <BriefingPanel>
                <PanelHeader>
                  <PanelEyebrow>The record</PanelEyebrow>
                  <PanelTitle>Recent Activity</PanelTitle>
                  <PanelDescription>
                    Every upload, open, share, and removal, newest first. The
                    log only grows; nothing can be edited out of it.
                  </PanelDescription>
                </PanelHeader>
                <PanelBody>
                  {events.length === 0 ? (
                    <p className="text-sm text-foreground-subtle">
                      Nothing recorded yet.
                    </p>
                  ) : (
                    <ActivityDigest>
                      {events.map((e) => (
                        <ActivityDigestItem
                          key={e.id}
                          when={format(new Date(e.created_at), "MMM d")}
                          title={eventTitle(
                            e,
                            new Map(docs.map((d) => [d.id, d.name])),
                          )}
                          by={
                            e.actor_id
                              ? nameOf.get(e.actor_id) ?? undefined
                              : undefined
                          }
                        />
                      ))}
                    </ActivityDigest>
                  )}
                </PanelBody>
              </BriefingPanel>
            )}
          </div>
        </>
      )}
    </div>
  );
}
