"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import {
  Bold,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
} from "lucide-react";

import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tone = ComponentProps<typeof Markdown>["tone"];

type ToolKind =
  | "bold"
  | "italic"
  | "heading"
  | "bullet"
  | "numbered"
  | "quote"
  | "link";

const TOOLS: { kind: ToolKind; label: string; icon: typeof Bold }[] = [
  { kind: "bold", label: "Bold", icon: Bold },
  { kind: "italic", label: "Italic", icon: Italic },
  { kind: "heading", label: "Heading", icon: Heading2 },
  { kind: "bullet", label: "Bulleted List", icon: List },
  { kind: "numbered", label: "Numbered List", icon: ListOrdered },
  { kind: "quote", label: "Quote", icon: Quote },
  { kind: "link", label: "Link", icon: Link2 },
];

/**
 * RichTextField — the friendly long-form editor for non-technical family
 * members (PRD 12, slice 1).
 *
 * It is deliberately a *lightweight toolbar over a <textarea>* rather than a
 * full WYSIWYG engine (the PRD's v1 decision):
 *
 *   - Content is stored as **Markdown**, exactly like the old raw textarea, so
 *     the no-raw-HTML security posture (`src/components/markdown.tsx`) and the
 *     single-renderer story are preserved. The Preview tab renders through that
 *     same `Markdown` component, so what you preview is what the page shows.
 *   - The toolbar inserts Markdown for you (bold, headings, lists, links,
 *     quotes) by operating on the textarea selection — the user never types
 *     `##` or `- ` themselves.
 *   - It submits via a real, named <textarea>, so the existing Server Actions
 *     that read `formData.get(name)` keep working with zero changes.
 */
export function RichTextField({
  name,
  defaultValue,
  tone = "ledger",
  rows = 8,
  placeholder,
  id: idProp,
  ariaLabel,
}: {
  /** Form field name — read by the Server Action via FormData. */
  name: string;
  defaultValue?: string | null;
  /** Preview rendering tone — match the page mode (salon = family). */
  tone?: Tone;
  rows?: number;
  placeholder?: string;
  id?: string;
  /** Accessible label for the textarea when there's no visible <Label>. */
  ariaLabel?: string;
}) {
  const reactId = useId();
  const id = idProp ?? `rtf-${reactId}`;
  const [value, setValue] = useState(defaultValue ?? "");
  const [mode, setMode] = useState<"write" | "preview">("write");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // After a toolbar edit we want to restore the caret/selection to where it
  // logically belongs. Because the textarea is controlled, the browser resets
  // the selection on re-render — so we stash the desired range and reapply it
  // synchronously before paint.
  const pendingSelection = useRef<[number, number] | null>(null);
  useLayoutEffect(() => {
    if (pendingSelection.current && textareaRef.current) {
      const [start, end] = pendingSelection.current;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(start, end);
      pendingSelection.current = null;
    }
  });

  /** Wrap the current selection with `before`/`after` (bold, italic, link). */
  function wrapSelection(before: string, after: string, placeholderText = "") {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end) || placeholderText;
    const next =
      value.slice(0, start) + before + selected + after + value.slice(end);
    setValue(next);
    // Select the inner text so the user can keep typing over the placeholder.
    pendingSelection.current = [
      start + before.length,
      start + before.length + selected.length,
    ];
  }

  /** Prefix every line touched by the selection (headings, lists, quotes). */
  function prefixLines(makePrefix: (lineIndex: number) => string) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;

    // Expand the range to whole lines.
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = value.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = value.length;

    const block = value.slice(lineStart, lineEnd);
    const prefixed = block
      .split("\n")
      .map((line, i) => makePrefix(i) + line)
      .join("\n");
    const next = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);
    setValue(next);
    pendingSelection.current = [lineStart, lineStart + prefixed.length];
  }

  // Plain data only — no ref-capturing closures live in render. The actual
  // edit happens in `applyTool`, which is invoked from the button's onClick
  // (an event handler, where reading the textarea ref is allowed).
  function applyTool(kind: ToolKind) {
    switch (kind) {
      case "bold":
        return wrapSelection("**", "**", "bold text");
      case "italic":
        return wrapSelection("_", "_", "italic text");
      case "heading":
        return prefixLines(() => "## ");
      case "bullet":
        return prefixLines(() => "- ");
      case "numbered":
        return prefixLines((i) => `${i + 1}. `);
      case "quote":
        return prefixLines(() => "> ");
      case "link":
        return wrapSelection("[", "](https://)", "link text");
    }
  }

  return (
    <div className="rounded-md border border-input bg-transparent focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
      {/* Toolbar + Write/Preview toggle */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-1.5 py-1">
        <div
          className="flex items-center gap-0.5"
          role="toolbar"
          aria-label="Formatting"
        >
          {TOOLS.map((tool) => (
            <Button
              key={tool.kind}
              type="button"
              variant="ghost"
              size="icon"
              aria-label={tool.label}
              title={tool.label}
              // Keep the textarea selection — don't let the button steal focus.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyTool(tool.kind)}
              disabled={mode === "preview"}
              className="text-foreground-muted hover:text-foreground"
            >
              <tool.icon aria-hidden />
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-0.5 text-xs" role="tablist">
          <ModeTab
            active={mode === "write"}
            onClick={() => setMode("write")}
          >
            Write
          </ModeTab>
          <ModeTab
            active={mode === "preview"}
            onClick={() => setMode("preview")}
          >
            Preview
          </ModeTab>
        </div>
      </div>

      {/* Write: the real, named textarea (stays mounted so it always submits) */}
      <textarea
        ref={textareaRef}
        id={id}
        name={name}
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => setValue(e.target.value)}
        className={cn(
          "w-full resize-y bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-foreground-subtle",
          mode === "preview" && "hidden",
        )}
      />

      {/* Preview: rendered through the exact display renderer (WYSIWYG-truthful) */}
      {mode === "preview" && (
        <div className="min-h-[6rem] px-3 py-2">
          <Markdown
            source={value}
            tone={tone}
            emptyHint="Nothing to preview yet. Switch to Write and add some content."
          />
        </div>
      )}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "rounded px-2 py-1 font-medium transition-colors",
        active
          ? "bg-surface text-foreground"
          : "text-foreground-subtle hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
