import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

type MarkdownTone = "salon" | "ledger" | "briefing";

/**
 * Render trusted Markdown into a typographic block tuned to a page mode.
 *
 *   tone="salon"     family content — warm, generous, display-serif headings
 *   tone="ledger"    operations content — utilitarian, tighter, less ornament
 *   tone="briefing"  advisory content — memo-like, disciplined hierarchy
 *
 * "Trusted" because every save goes through a signed-in family member and
 * is auditable via the revisions table. We do NOT pass through raw HTML
 * (no rehype-raw) so an attacker who somehow got write access can't inject
 * scripts via embedded <script> tags.
 */
export function Markdown({
  source,
  tone = "ledger",
  className,
  emptyHint = "Nothing here yet. Edit to add details.",
}: {
  source: string | null | undefined;
  tone?: MarkdownTone;
  className?: string;
  emptyHint?: string;
}) {
  if (!source || !source.trim()) {
    return (
      <p className="text-sm italic text-foreground-subtle">{emptyHint}</p>
    );
  }

  // Shared prose foundation, then per-tone overrides. Headings inside
  // Markdown use Fraunces in salon/briefing tones (where they read as
  // editorial). Ledger tone stays sans for utilitarian operations docs.
  const baseProse = cn(
    "prose prose-sm max-w-none",
    "prose-p:leading-relaxed",
    "prose-strong:text-foreground prose-strong:font-medium",
    "prose-a:text-foreground prose-a:underline-offset-4 hover:prose-a:underline",
    "prose-ul:my-2 prose-li:my-0.5 prose-li:marker:text-foreground-subtle",
    "prose-blockquote:border-l-accent-bronze/50 prose-blockquote:not-italic prose-blockquote:text-foreground-muted",
    "prose-code:rounded prose-code:bg-surface prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-mono prose-code:before:content-none prose-code:after:content-none"
  );

  const toneProse = {
    salon: cn(
      "prose-headings:font-display prose-headings:tracking-[-0.012em] prose-headings:text-foreground",
      "prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3",
      "prose-h3:text-base prose-h3:mt-6 prose-h3:mb-2",
      "prose-p:text-[0.95rem] prose-p:text-foreground"
    ),
    ledger: cn(
      "prose-headings:font-sans prose-headings:font-medium prose-headings:tracking-tight prose-headings:text-foreground",
      "prose-h2:text-base prose-h2:mt-6 prose-h2:mb-2",
      "prose-h3:text-sm prose-h3:mt-4 prose-h3:mb-1.5",
      "prose-p:text-foreground"
    ),
    briefing: cn(
      "prose-headings:font-display prose-headings:tracking-[-0.012em] prose-headings:text-foreground",
      "prose-h2:text-lg prose-h2:mt-7 prose-h2:mb-2",
      "prose-h3:text-sm prose-h3:mt-5 prose-h3:mb-1.5 prose-h3:font-sans prose-h3:font-medium",
      "prose-p:text-foreground"
    ),
  }[tone];

  return (
    <div data-tone={tone} className={cn(baseProse, toneProse, className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  );
}
