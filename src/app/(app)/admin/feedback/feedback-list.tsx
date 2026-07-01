"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import type { FeedbackCategory, FeedbackStatus } from "@/lib/db/schema";
import { updateFeedbackStatus } from "./actions";

export type FeedbackRow = {
  id: string;
  category: FeedbackCategory;
  message: string;
  page_url: string | null;
  status: FeedbackStatus;
  created_at: string;
  submitter_name: string | null;
  submitter_email: string | null;
};

const STATUSES: FeedbackStatus[] = ["new", "seen", "planned", "done"];

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "New",
  seen: "Seen",
  planned: "Planned",
  done: "Done",
};

const CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  idea: "Idea",
  problem: "Problem",
  other: "Other",
};

function CategoryBadge({ category }: { category: FeedbackCategory }) {
  const variant =
    category === "idea"
      ? "advisory"
      : category === "problem"
        ? "family"
        : "neutral";
  return <Badge variant={variant}>{CATEGORY_LABEL[category]}</Badge>;
}

export function FeedbackList({ items }: { items: FeedbackRow[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm italic text-foreground-subtle">
        No feedback yet. When the family sends a note, it lands here.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-border border-y border-border">
      {items.map((item) => (
        <li key={item.id} className="py-4">
          <FeedbackRowItem item={item} />
        </li>
      ))}
    </ul>
  );
}

function FeedbackRowItem({ item }: { item: FeedbackRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const submitted = new Date(item.created_at);
  const who =
    item.submitter_name ?? item.submitter_email ?? "A family member";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <CategoryBadge category={item.category} />
        <span className="text-xs text-foreground-subtle">
          {who} · {submitted.toLocaleDateString()}
        </span>
      </div>

      <p className="max-w-prose whitespace-pre-wrap text-sm text-foreground">
        {item.message}
      </p>

      {item.page_url && (
        <p className="text-xs text-foreground-subtle">
          From <span className="text-foreground-muted">{item.page_url}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-foreground-subtle">Status</span>
        {STATUSES.map((s) => {
          const active = s === item.status;
          return (
            <button
              key={s}
              type="button"
              disabled={pending || active}
              onClick={() => {
                startTransition(async () => {
                  try {
                    await updateFeedbackStatus(item.id, s);
                    router.refresh();
                  } catch (err) {
                    alert(err instanceof Error ? err.message : "Failed");
                  }
                });
              }}
              className={
                active
                  ? "rounded-full bg-foreground/85 px-2.5 py-0.5 text-[0.6875rem] font-medium tracking-wide text-background"
                  : "rounded-full border border-border-strong px-2.5 py-0.5 text-[0.6875rem] font-medium tracking-wide text-foreground-muted transition-colors hover:border-foreground-muted hover:text-foreground disabled:opacity-50"
              }
            >
              {STATUS_LABEL[s]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
