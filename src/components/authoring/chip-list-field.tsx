"use client";

import { useId, useRef, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * ChipListField — add/remove a list of short discrete values as removable
 * chips, instead of asking the user to type "one per line" (PRD 12, slice 2).
 *
 * Generalizes the property form's `PeakRangeEditor` add/remove pattern.
 *
 * Storage stays dumb on purpose: the chips are submitted as a single
 * **newline-joined** hidden input under `name`, so the existing Server Action
 * (`parseAmenities` splits on newlines) keeps working with zero changes. A
 * consumer that wants structured storage can read `formData.getAll` instead by
 * passing `submitAs="multiple"`.
 */
export function ChipListField({
  name,
  defaultItems,
  placeholder = "Type and press Enter…",
  addLabel = "Add",
  inputAriaLabel,
  emptyHint,
  maxItems = 100,
  submitAs = "newlines",
  id: idProp,
}: {
  /** Form field name read by the Server Action. */
  name: string;
  defaultItems?: string[] | null;
  placeholder?: string;
  addLabel?: string;
  inputAriaLabel?: string;
  emptyHint?: string;
  maxItems?: number;
  /** Id for the add-input, so a sibling <Label htmlFor> can target it. */
  id?: string;
  /**
   * "newlines" (default): one hidden <input> whose value is items joined by
   * "\n" — matches the legacy "one per line" parsers.
   * "multiple": one hidden <input> per item sharing `name` — read via
   * formData.getAll(name).
   */
  submitAs?: "newlines" | "multiple";
}) {
  const reactId = useId();
  const inputId = idProp ?? `chips-${reactId}`;
  const [items, setItems] = useState<string[]>(
    () => (defaultItems ?? []).filter((s) => s.trim().length > 0),
  );
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function add() {
    const value = draft.trim();
    if (!value) return;
    // Case-insensitive de-dupe — don't add "Kayak" twice.
    if (items.some((i) => i.toLowerCase() === value.toLowerCase())) {
      setDraft("");
      return;
    }
    if (items.length >= maxItems) return;
    setItems([...items, value]);
    setDraft("");
    inputRef.current?.focus();
  }

  function remove(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Hidden value(s) — what actually submits with the form. */}
      {submitAs === "newlines" ? (
        <input type="hidden" name={name} value={items.join("\n")} />
      ) : (
        items.map((item, i) => (
          <input key={i} type="hidden" name={name} value={item} />
        ))
      )}

      {items.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <li key={i}>
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface py-1 pl-2.5 pr-1 text-sm text-foreground">
                {item}
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={`Remove ${item}`}
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

      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          id={inputId}
          value={draft}
          placeholder={placeholder}
          aria-label={inputAriaLabel}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter adds an item rather than submitting the surrounding form.
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className={cn("max-w-[20rem]")}
        />
        <Button type="button" variant="outline" size="sm" onClick={add}>
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
