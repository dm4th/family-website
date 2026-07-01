import Link from "next/link";

export type StorySummary = {
  id: string;
  title: string;
  authorName: string | null;
  recordedOn: string | null; // ISO timestamp
  people: { id: string; displayName: string; inMemoriam: boolean }[];
  snippet: string | null;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "Recorded March 3, 2026" from an ISO timestamp; "" if unknown. */
function recordedLabel(iso: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  const [, y, mo, d] = m.map(Number) as unknown as [string, number, number, number];
  const month = MONTHS[mo - 1];
  return month ? `Recorded ${month} ${d}, ${y}` : "";
}

/**
 * Turn a Markdown body into a one-line plain-text preview: strip the common
 * markers (#, *, _, >, links, backticks) and collapse whitespace.
 */
export function storySnippet(body: string | null, max = 180): string | null {
  if (!body) return null;
  const text = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/**
 * A list of story cards, reused on the stories hub and on the person / album /
 * event surfaces. Presentational + server-rendered (plain links, no client JS).
 */
export function StoryList({ stories }: { stories: StorySummary[] }) {
  if (stories.length === 0) return null;
  return (
    <ul className="flex flex-col gap-4">
      {stories.map((s) => {
        const meta = [s.authorName, recordedLabel(s.recordedOn)].filter(Boolean).join(" · ");
        return (
          <li key={s.id}>
            <article className="flex flex-col gap-1.5 rounded-2xl border border-border/70 bg-surface-raised px-5 py-5 shadow-whisper sm:px-6">
              <h3 className="font-display text-xl leading-tight text-foreground">
                <Link
                  href={`/family/stories/${s.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {s.title}
                </Link>
              </h3>
              {meta && <p className="text-xs text-foreground-subtle">{meta}</p>}
              {s.snippet && (
                <p className="line-clamp-2 max-w-prose text-sm leading-relaxed text-foreground-muted">
                  {s.snippet}
                </p>
              )}
              {s.people.length > 0 && (
                <p className="text-xs text-foreground-subtle">
                  About{" "}
                  {s.people.map((p, i) => (
                    <span key={p.id}>
                      {i > 0 && ", "}
                      <Link
                        href={`/family/tree/${p.id}`}
                        className="underline-offset-4 hover:text-foreground hover:underline"
                      >
                        {p.inMemoriam ? `† ${p.displayName}` : p.displayName}
                      </Link>
                    </span>
                  ))}
                </p>
              )}
            </article>
          </li>
        );
      })}
    </ul>
  );
}
