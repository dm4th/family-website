import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { BriefingPanel, PageIntro } from "@/components/shell";
import type { FeedbackCategory, FeedbackStatus } from "@/lib/db/schema";
import { FeedbackList, type FeedbackRow } from "./feedback-list";

export const dynamic = "force-dynamic";

export default async function AdminFeedbackPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: adminCheck } = await supabase.rpc("is_admin");
  if (adminCheck !== true) {
    // Don't acknowledge the page exists for non-admins.
    notFound();
  }

  const { data: rows } = await supabase
    .from("feedback")
    .select(
      `id, category, message, page_url, status, created_at,
       profiles:created_by ( full_name, email )`,
    )
    .order("created_at", { ascending: false });

  const items: FeedbackRow[] = (rows ?? []).map((r) => {
    const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return {
      id: r.id,
      category: r.category as FeedbackCategory,
      message: r.message,
      page_url: r.page_url,
      status: r.status as FeedbackStatus,
      created_at: r.created_at,
      submitter_name: prof?.full_name ?? null,
      submitter_email: prof?.email ?? null,
    };
  });

  const newCount = items.filter((i) => i.status === "new").length;

  return (
    <div className="flex flex-col gap-12">
      <PageIntro
        mode="advisory"
        eyebrow="Governance"
        title="Feedback"
        context={
          newCount > 0
            ? `${newCount} new ${newCount === 1 ? "note" : "notes"} from the family, newest first.`
            : "Suggestions and problem reports from the family, newest first."
        }
      />

      <div>
        <Link
          href="/admin"
          className="text-sm text-foreground-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Back to Admin
        </Link>
      </div>

      <BriefingPanel>
        <section className="flex flex-col gap-5">
          <header className="flex flex-col gap-1">
            <p className="eyebrow text-accent-bronze">Section</p>
            <h2 className="font-display text-2xl leading-tight text-foreground">
              The queue
            </h2>
            <p className="max-w-prose text-sm text-foreground-muted">
              Advance each note as you work it: New, Seen, Planned, Done. The
              record stays here even after it&apos;s handled.
            </p>
          </header>
          <FeedbackList items={items} />
        </section>
      </BriefingPanel>
    </div>
  );
}
