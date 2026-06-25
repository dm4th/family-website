"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchPeople, type PersonHit } from "./people-actions";

type SelectedPerson = {
  id: string;
  displayName: string;
  familyBranch?: string | null;
  inMemoriam?: boolean;
};

/**
 * PeoplePicker — tag family members and ancestors by *name* via typeahead,
 * instead of typing opaque UUIDs (PRD 12, slice 3). Backed by the Legacy
 * `people` table through the {@link searchPeople} server action.
 *
 * Selected people render as removable chips and submit as one hidden <input>
 * per id under `name` — a consumer reads them with `formData.getAll(name)`,
 * which maps cleanly onto a join table (photo_subjects, event_subjects, …).
 *
 * Dependency-free (no cmdk/popover): a plain input + a positioned results
 * list, consistent with the rest of the authoring layer.
 */
export function PeoplePicker({
  name,
  defaultSelected = [],
  placeholder = "Search by name…",
  inputAriaLabel,
  emptyHint,
  id: idProp,
}: {
  name: string;
  defaultSelected?: SelectedPerson[];
  placeholder?: string;
  inputAriaLabel?: string;
  emptyHint?: string;
  id?: string;
}) {
  const reactId = useId();
  const inputId = idProp ?? `people-${reactId}`;
  const listboxId = `${inputId}-listbox`;

  const [selected, setSelected] = useState<SelectedPerson[]>(defaultSelected);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0); // highlighted result index

  const rootRef = useRef<HTMLDivElement>(null);

  // Debounced search. Skips anyone already selected.
  useEffect(() => {
    let cancelled = false;
    if (!open) return;
    const t = setTimeout(async () => {
      setLoading(true);
      const hits = await searchPeople(query);
      if (cancelled) return;
      const selectedIds = new Set(selected.map((p) => p.id));
      setResults(hits.filter((h) => !selectedIds.has(h.id)));
      setActive(0);
      setLoading(false);
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open, selected]);

  // Close the dropdown on an outside click.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function addPerson(p: PersonHit) {
    setSelected((prev) =>
      prev.some((s) => s.id === p.id)
        ? prev
        : [
            ...prev,
            {
              id: p.id,
              displayName: p.displayName,
              familyBranch: p.familyBranch,
              inMemoriam: p.inMemoriam,
            },
        ],
    );
    setQuery("");
    setResults([]);
  }

  function removePerson(id: string) {
    setSelected((prev) => prev.filter((p) => p.id !== id));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      // Add the highlighted result rather than submitting the form.
      e.preventDefault();
      const hit = results[active];
      if (hit) addPerson(hit);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-2">
      {/* Submitted value(s): one hidden input per selected person. */}
      {selected.map((p) => (
        <input key={p.id} type="hidden" name={name} value={p.id} />
      ))}

      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((p) => (
            <li key={p.id}>
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface py-1 pl-2.5 pr-1 text-sm text-foreground">
                {p.inMemoriam && (
                  <span aria-label="In memoriam" title="In memoriam">
                    †
                  </span>
                )}
                {p.displayName}
                <button
                  type="button"
                  onClick={() => removePerson(p.id)}
                  aria-label={`Remove ${p.displayName}`}
                  className="inline-flex size-5 items-center justify-center rounded text-foreground-subtle transition-colors hover:bg-background hover:text-foreground"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : emptyHint ? (
        <p className="text-xs italic text-foreground-subtle">{emptyHint}</p>
      ) : null}

      <div className="relative max-w-[20rem]">
        <Input
          id={inputId}
          value={query}
          placeholder={placeholder}
          aria-label={inputAriaLabel}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />

        {open && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-background p-1 shadow-panel"
          >
            {loading ? (
              <li className="px-2 py-1.5 text-sm text-foreground-subtle">
                Searching…
              </li>
            ) : results.length === 0 ? (
              <li className="px-2 py-1.5 text-sm text-foreground-subtle">
                {query.trim() ? "No matches." : "No people yet."}
              </li>
            ) : (
              results.map((p, i) => (
                <li key={p.id} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => addPerson(p)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors",
                      i === active
                        ? "bg-surface text-foreground"
                        : "text-foreground hover:bg-surface",
                    )}
                  >
                    <span className="flex items-center gap-1">
                      {p.inMemoriam && <span aria-hidden>†</span>}
                      {p.displayName}
                    </span>
                    {p.familyBranch && (
                      <span className="text-xs text-foreground-subtle">
                        {p.familyBranch}
                      </span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
