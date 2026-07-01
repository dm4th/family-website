"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  computeVerdicts,
  parsePeopleCsv,
  PERSON_IMPORT_COLUMNS,
  PERSON_IMPORT_TEMPLATE,
  type DedupVerdict,
  type ParsedImportRow,
} from "@/lib/legacy-import";
import { commitPeopleImport, type CommitImportResult } from "./import-actions";

type Phase =
  | { step: "input" }
  | { step: "preview"; rows: ParsedImportRow[]; verdicts: Map<number, DedupVerdict>; ignored: string[] }
  | { step: "done"; result: Extract<CommitImportResult, { ok: true }> };

const VERDICT_LABEL: Record<DedupVerdict, string> = {
  new: "New",
  "duplicate-existing": "Already in the tree",
  "duplicate-in-file": "Repeated in this file",
};

export function PeopleImport({
  existingNamesLower,
}: {
  existingNamesLower: string[];
}) {
  const [phase, setPhase] = useState<Phase>({ step: "input" });
  const [parseError, setParseError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [include, setInclude] = useState<Set<number>>(new Set());
  const [commitError, setCommitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  function preview(text: string) {
    setParseError(null);
    setCommitError(null);
    const result = parsePeopleCsv(text);
    if (!result.ok) {
      setParseError(result.error);
      return;
    }
    if (result.rows.length === 0) {
      setParseError("No data rows found beneath the header.");
      return;
    }
    const verdicts = computeVerdicts(result.rows, existingNamesLower);
    // Default selection: importable, brand-new rows. Duplicates and nameless
    // rows start unchecked so a re-run imports nothing unless deliberately chosen.
    const initial = new Set<number>();
    for (const row of result.rows) {
      if (row.importable && verdicts.get(row.rowNumber) === "new") {
        initial.add(row.rowNumber);
      }
    }
    setInclude(initial);
    setPhase({ step: "preview", rows: result.rows, verdicts, ignored: result.ignored });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    preview(text);
  }

  function downloadTemplate() {
    const blob = new Blob([PERSON_IMPORT_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "people-import-template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function commit() {
    if (phase.step !== "preview") return;
    const chosen = phase.rows.filter((r) => include.has(r.rowNumber) && r.importable);
    setCommitError(null);
    startTransition(async () => {
      const result = await commitPeopleImport(chosen.map((r) => r.fields));
      if (!result.ok) {
        setCommitError(result.message);
        return;
      }
      setPhase({ step: "done", result });
      router.refresh();
    });
  }

  if (phase.step === "done") {
    return <ImportSummary result={phase.result} onReset={() => reset()} />;
  }

  function reset() {
    setPhase({ step: "input" });
    setPasted("");
    setInclude(new Set());
    setParseError(null);
    setCommitError(null);
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
            Download Template
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={onFile}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            Choose a CSV File
          </Button>
        </div>
        <p className="text-sm text-foreground-muted">
          Fill the template with one relative per row (living members and
          ancestors alike; ancestors need no account), then upload it here. You
          can also paste rows below. Nothing is added until you review a preview
          and confirm.
        </p>
        <p className="text-xs text-foreground-subtle">
          Columns: {PERSON_IMPORT_COLUMNS.join(", ")}. Only{" "}
          <span className="text-foreground">display_name</span> is required.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <label htmlFor="paste" className="text-sm font-medium text-foreground">
          Or paste CSV rows
        </label>
        <Textarea
          id="paste"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder={"display_name,family_branch\nMargaret Mathieson,Mathieson"}
          className="min-h-32 font-mono text-xs"
        />
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!pasted.trim()}
            onClick={() => preview(pasted)}
          >
            Preview Import
          </Button>
        </div>
      </section>

      {parseError && <p className="text-sm text-destructive">{parseError}</p>}

      {phase.step === "preview" && (
        <PreviewTable
          rows={phase.rows}
          verdicts={phase.verdicts}
          ignored={phase.ignored}
          include={include}
          setInclude={setInclude}
          isPending={isPending}
          commitError={commitError}
          onCommit={commit}
          onCancel={reset}
        />
      )}
    </div>
  );
}

function PreviewTable({
  rows,
  verdicts,
  ignored,
  include,
  setInclude,
  isPending,
  commitError,
  onCommit,
  onCancel,
}: {
  rows: ParsedImportRow[];
  verdicts: Map<number, DedupVerdict>;
  ignored: string[];
  include: Set<number>;
  setInclude: (next: Set<number>) => void;
  isPending: boolean;
  commitError: string | null;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const importableRows = rows.filter((r) => r.importable);
  const selectedCount = rows.filter((r) => include.has(r.rowNumber) && r.importable).length;
  const nameless = rows.length - importableRows.length;

  function toggle(rowNumber: number) {
    const next = new Set(include);
    if (next.has(rowNumber)) next.delete(rowNumber);
    else next.add(rowNumber);
    setInclude(next);
  }

  function setAll(on: boolean) {
    if (!on) return setInclude(new Set());
    setInclude(new Set(importableRows.map((r) => r.rowNumber)));
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl text-foreground">Preview</h2>
        <div className="flex items-center gap-3 text-xs text-foreground-subtle">
          <button type="button" className="underline-offset-4 hover:underline" onClick={() => setAll(true)}>
            Select all
          </button>
          <button type="button" className="underline-offset-4 hover:underline" onClick={() => setAll(false)}>
            Select none
          </button>
        </div>
      </div>

      <p className="text-sm text-foreground-muted">
        {selectedCount} selected of {importableRows.length} importable
        {nameless > 0 ? ` · ${nameless} row${nameless === 1 ? "" : "s"} without a name` : ""}.
        Duplicates start unselected so a re-run adds nothing by default.
      </p>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-foreground-subtle">
              <th className="w-10 px-3 py-2" />
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Branch</th>
              <th className="px-3 py-2 font-medium">Born</th>
              <th className="px-3 py-2 font-medium">Died</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const verdict = verdicts.get(row.rowNumber) ?? "new";
              const checked = include.has(row.rowNumber);
              return (
                <tr
                  key={row.rowNumber}
                  className={cn(
                    "border-b border-border/60 last:border-0",
                    !row.importable && "opacity-60",
                  )}
                >
                  <td className="px-3 py-2 align-top">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!row.importable}
                      onChange={() => toggle(row.rowNumber)}
                      aria-label={`Include ${row.fields.display_name || `row ${row.rowNumber}`}`}
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="text-foreground">
                      {row.fields.display_name || <em className="text-foreground-subtle">no name</em>}
                    </span>
                    {row.warnings.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs text-accent-bronze">
                        {row.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-foreground-muted">
                    {row.fields.family_branch ?? "—"}
                  </td>
                  <td className="px-3 py-2 align-top text-foreground-muted">
                    {row.fields.birth_date ?? row.fields.birth_circa ?? "—"}
                  </td>
                  <td className="px-3 py-2 align-top text-foreground-muted">
                    {row.fields.death_date ?? row.fields.death_circa ?? "—"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs",
                        verdict === "new" ? "text-foreground" : "text-foreground-subtle",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "size-1.5 rounded-full",
                          verdict === "new" ? "bg-accent-family" : "bg-foreground-subtle/50",
                        )}
                      />
                      {VERDICT_LABEL[verdict]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ignored.length > 0 && (
        <p className="text-xs text-foreground-subtle">
          Ignored unrecognized column{ignored.length === 1 ? "" : "s"}: {ignored.join(", ")}.
        </p>
      )}

      {commitError && <p className="text-sm text-destructive">{commitError}</p>}

      <div className="flex items-center gap-3">
        <Button type="button" size="sm" disabled={isPending || selectedCount === 0} onClick={onCommit}>
          {isPending
            ? "Importing…"
            : `Import ${selectedCount} ${selectedCount === 1 ? "Person" : "People"}`}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={onCancel}>
          Start Over
        </Button>
      </div>
    </section>
  );
}

function ImportSummary({
  result,
  onReset,
}: {
  result: Extract<CommitImportResult, { ok: true }>;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface/60 px-6 py-8">
      <h2 className="font-display text-xl text-foreground">Import complete</h2>
      <ul className="flex flex-col gap-1 text-sm text-foreground-muted">
        <li>
          <span className="text-foreground">{result.created}</span> added to the tree.
        </li>
        {result.skippedDuplicate > 0 && (
          <li>{result.skippedDuplicate} skipped as duplicates.</li>
        )}
        {result.failed > 0 && <li>{result.failed} could not be imported.</li>}
      </ul>
      {result.errors.length > 0 && (
        <ul className="space-y-0.5 text-xs text-destructive">
          {result.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-3">
        <Button asChild size="sm">
          <Link href="/family/tree">Open the Tree</Link>
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onReset}>
          Import Another File
        </Button>
      </div>
    </div>
  );
}
