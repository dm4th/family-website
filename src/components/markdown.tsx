import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Render trusted Markdown into a simple typographic block.
 *
 * "Trusted" because every save goes through a signed-in family member and
 * is auditable via the revisions table. We do NOT pass through raw HTML
 * (no rehype-raw) so an attacker who somehow got write access can't inject
 * scripts via embedded <script> tags.
 */
export function Markdown({
  source,
  className,
}: {
  source: string | null | undefined;
  className?: string;
}) {
  if (!source || !source.trim()) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Nothing here yet — edit to add details.
      </p>
    );
  }
  return (
    <div
      className={[
        "prose prose-sm max-w-none",
        "prose-headings:font-semibold prose-headings:tracking-tight",
        "prose-h2:text-base prose-h2:mt-6 prose-h2:mb-2",
        "prose-h3:text-sm prose-h3:mt-4 prose-h3:mb-1.5",
        "prose-p:leading-relaxed",
        "prose-a:text-foreground prose-a:underline-offset-4 hover:prose-a:underline",
        "prose-strong:text-foreground",
        "prose-ul:my-2 prose-li:my-0.5",
        className ?? "",
      ].join(" ")}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  );
}
