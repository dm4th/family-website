"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BriefingPanel,
  PanelBody,
  PanelDescription,
  PanelEyebrow,
  PanelHeader,
  PanelTitle,
} from "@/components/shell";
import { applyTrustTaxonomy, proposeTaxonomyAction } from "../actions";

/**
 * The organize flow (PRD 40 slice 2), the intake posture applied to the whole
 * register: AI proposes, a manager edits every part of it, one gated action
 * applies. The review state IS the payload — what you see on screen is exactly
 * the mapping that gets applied, whole-register semantics, so there is never a
 * hidden leftover assignment.
 */

type Doc = { id: string; name: string };

type ReviewCategory = {
  key: string;
  existingCategoryId: string | null;
  name: string;
  description: string;
  docIds: string[];
};

type ReviewState = {
  categories: ReviewCategory[];
  unassigned: { docId: string; reason: string }[];
};

type Phase =
  | { step: "idle" }
  | { step: "proposing" }
  | { step: "review"; state: ReviewState }
  | { step: "done" };

export function OrganizeFlow({
  documents,
  hasExisting,
  configured,
}: {
  documents: Doc[];
  hasExisting: boolean;
  configured: boolean;
}) {
  const [phase, setPhase] = useState<Phase>({ step: "idle" });
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const nameOf = new Map(documents.map((d) => [d.id, d.name]));

  function propose() {
    setPhase({ step: "proposing" });
    startTransition(async () => {
      const result = await proposeTaxonomyAction();
      if (!result.ok) {
        toast.error("Couldn't propose an organization", {
          description: result.message,
        });
        setPhase({ step: "idle" });
        return;
      }
      setPhase({
        step: "review",
        state: {
          categories: result.proposal.categories.map((c, i) => ({
            key: `c${i}`,
            existingCategoryId: c.existingCategoryId,
            name: c.name,
            description: c.description ?? "",
            docIds: c.documentIds,
          })),
          unassigned: result.proposal.unassigned.map((u) => ({
            docId: u.documentId,
            reason: u.reason,
          })),
        },
      });
    });
  }

  function update(mutate: (s: ReviewState) => ReviewState) {
    setPhase((p) => (p.step === "review" ? { step: "review", state: mutate(p.state) } : p));
  }

  function apply(state: ReviewState) {
    startTransition(async () => {
      const result = await applyTrustTaxonomy({
        categories: state.categories.map((c) => ({
          existingCategoryId: c.existingCategoryId,
          name: c.name,
          description: c.description.trim() || null,
          documentIds: c.docIds,
        })),
      });
      if (!result.ok) {
        toast.error("Couldn't apply the organization", {
          description: result.message,
        });
        return;
      }
      setPhase({ step: "done" });
      router.refresh();
    });
  }

  if (phase.step === "idle" || phase.step === "proposing") {
    return (
      <BriefingPanel>
        <PanelHeader>
          <PanelEyebrow>Step one</PanelEyebrow>
          <PanelTitle>Propose an Organization</PanelTitle>
          <PanelDescription>
            {`The register holds ${documents.length} document${documents.length === 1 ? "" : "s"}. `}
            {hasExisting
              ? "The proposal starts from the categories you already approved and fits new documents into them."
              : "The categories are proposed from the documents themselves, then you edit and approve before anything changes."}
          </PanelDescription>
        </PanelHeader>
        <PanelBody>
          {!configured ? (
            <p className="text-sm text-foreground-muted">
              Organizing documents isn&rsquo;t set up yet. An admin needs to add
              the ANTHROPIC_API_KEY setting.
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <Button
                type="button"
                disabled={phase.step === "proposing" || pending}
                onClick={propose}
              >
                {phase.step === "proposing" ? "Reading the register…" : "Propose an Organization"}
              </Button>
              <Link
                href="/advisory/documents"
                className="text-sm text-foreground-muted underline-offset-4 hover:underline"
              >
                Back to Trust Documents
              </Link>
            </div>
          )}
        </PanelBody>
      </BriefingPanel>
    );
  }

  if (phase.step === "done") {
    return (
      <BriefingPanel>
        <PanelHeader>
          <PanelEyebrow>Applied</PanelEyebrow>
          <PanelTitle>The Register Is Organized</PanelTitle>
          <PanelDescription>
            The documents page now groups by these categories. Run this again
            any time; your approved structure is the starting point.
          </PanelDescription>
        </PanelHeader>
        <Link
          href="/advisory/documents"
          className="text-sm text-accent-advisory underline-offset-4 hover:underline"
        >
          Back to Trust Documents
        </Link>
      </BriefingPanel>
    );
  }

  const { state } = phase;
  const nameProblems = new Set<string>();
  {
    const seen = new Map<string, string>();
    for (const c of state.categories) {
      const k = c.name.trim().toLowerCase();
      if (!k) nameProblems.add(c.key);
      else if (seen.has(k)) {
        nameProblems.add(c.key);
        nameProblems.add(seen.get(k)!);
      } else seen.set(k, c.key);
    }
  }
  const emptyCategories = state.categories.filter((c) => c.docIds.length === 0);
  const canApply =
    !pending && nameProblems.size === 0 && emptyCategories.length === 0 && state.categories.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <BriefingPanel>
        <PanelHeader>
          <PanelEyebrow>Step two</PanelEyebrow>
          <PanelTitle>Review Before Anything Changes</PanelTitle>
          <PanelDescription>
            Rename categories, move documents, or set them aside. Nothing is
            saved until you press Apply, and the whole page is exactly what
            gets applied.
          </PanelDescription>
        </PanelHeader>
        <PanelBody>
          {state.categories.map((cat) => (
            <div
              key={cat.key}
              className="flex flex-col gap-3 rounded-sm border border-border p-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  aria-label="Category name"
                  value={cat.name}
                  onChange={(e) =>
                    update((s) => ({
                      ...s,
                      categories: s.categories.map((c) =>
                        c.key === cat.key ? { ...c, name: e.target.value } : c,
                      ),
                    }))
                  }
                  className="sm:max-w-xs font-medium"
                />
                <Input
                  aria-label="Category description"
                  placeholder="One-line description (optional)"
                  value={cat.description}
                  onChange={(e) =>
                    update((s) => ({
                      ...s,
                      categories: s.categories.map((c) =>
                        c.key === cat.key ? { ...c, description: e.target.value } : c,
                      ),
                    }))
                  }
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-foreground-muted hover:text-destructive"
                  onClick={() =>
                    update((s) => ({
                      categories: s.categories.filter((c) => c.key !== cat.key),
                      unassigned: [
                        ...s.unassigned,
                        ...cat.docIds.map((docId) => ({
                          docId,
                          reason: "Its category was removed during review.",
                        })),
                      ],
                    }))
                  }
                >
                  Remove Category
                </Button>
              </div>
              {nameProblems.has(cat.key) && (
                <p className="text-sm text-destructive">
                  Every category needs its own name.
                </p>
              )}
              {cat.docIds.length === 0 ? (
                <p className="text-sm text-destructive">
                  No documents left here. Move one in, or remove the category.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-border border-y border-border">
                  {cat.docIds.map((docId) => (
                    <li
                      key={docId}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <span className="min-w-0 truncate text-sm text-foreground">
                        {nameOf.get(docId) ?? "A document"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-foreground-muted"
                        onClick={() =>
                          update((s) => ({
                            categories: s.categories.map((c) =>
                              c.key === cat.key
                                ? { ...c, docIds: c.docIds.filter((id) => id !== docId) }
                                : c,
                            ),
                            unassigned: [
                              ...s.unassigned,
                              { docId, reason: "Set aside during review." },
                            ],
                          }))
                        }
                      >
                        Set Aside
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() =>
              update((s) => ({
                ...s,
                categories: [
                  ...s.categories,
                  {
                    key: `n${Date.now()}`,
                    existingCategoryId: null,
                    name: "",
                    description: "",
                    docIds: [],
                  },
                ],
              }))
            }
          >
            Add a Category
          </Button>
        </PanelBody>
      </BriefingPanel>

      <BriefingPanel>
        <PanelHeader>
          <PanelEyebrow>Set aside</PanelEyebrow>
          <PanelTitle>Not in Any Category</PanelTitle>
          <PanelDescription>
            These stay in the register under &ldquo;Not Yet Categorized&rdquo;.
            The proposal&rsquo;s reason is shown; move any of them into a
            category if it disagrees with you.
          </PanelDescription>
        </PanelHeader>
        <PanelBody>
          {state.unassigned.length === 0 ? (
            <p className="text-sm text-foreground-subtle">
              Every document has a place.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border border-y border-border">
              {state.unassigned.map((u) => (
                <li
                  key={u.docId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm text-foreground">
                      {nameOf.get(u.docId) ?? "A document"}
                    </span>
                    <span className="text-xs text-foreground-subtle">{u.reason}</span>
                  </div>
                  <select
                    aria-label={`Move ${nameOf.get(u.docId) ?? "document"} into a category`}
                    value=""
                    disabled={pending || state.categories.length === 0}
                    onChange={(e) => {
                      const key = e.target.value;
                      if (!key) return;
                      update((s) => ({
                        categories: s.categories.map((c) =>
                          c.key === key ? { ...c, docIds: [...c.docIds, u.docId] } : c,
                        ),
                        unassigned: s.unassigned.filter((x) => x.docId !== u.docId),
                      }));
                    }}
                    className="h-10 shrink-0 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
                  >
                    <option value="">Move into…</option>
                    {state.categories.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.name.trim() || "(unnamed category)"}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-3 border-t border-border pt-5">
            <Button type="button" disabled={!canApply} onClick={() => apply(state)}>
              {pending ? "Applying…" : "Apply This Organization"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setPhase({ step: "idle" })}
            >
              Start Over
            </Button>
          </div>
        </PanelBody>
      </BriefingPanel>
    </div>
  );
}
